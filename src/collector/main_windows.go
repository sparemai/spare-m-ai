//go:build windows

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const version = "0.5.0"
const driveFixed = 3

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetLogicalDrives     = kernel32.NewProc("GetLogicalDrives")
	procGetDriveTypeW        = kernel32.NewProc("GetDriveTypeW")
	procGetDiskFreeSpaceExW  = kernel32.NewProc("GetDiskFreeSpaceExW")
	procGetTickCount64       = kernel32.NewProc("GetTickCount64")
)

type filetime struct{ LowDateTime, HighDateTime uint32 }

func (f filetime) u64() uint64 { return uint64(f.HighDateTime)<<32 | uint64(f.LowDateTime) }

type memoryStatusEx struct {
	Length                                                                                               uint32
	MemoryLoad                                                                                           uint32
	TotalPhys, AvailPhys, TotalPageFile, AvailPageFile, TotalVirtual, AvailVirtual, AvailExtendedVirtual uint64
}

type CPU struct {
	UsagePercent float64 `json:"usage_percent"`
	SampleMS     int64   `json:"sample_ms"`
}
type Memory struct {
	UsedPercent        float64 `json:"used_percent"`
	TotalBytes         uint64  `json:"total_bytes"`
	AvailableBytes     uint64  `json:"available_bytes"`
	PageFileTotalBytes uint64  `json:"pagefile_total_bytes"`
	PageFileUsedBytes  uint64  `json:"pagefile_used_bytes"`
}
type Disk struct {
	Mount       string  `json:"mount"`
	TotalBytes  uint64  `json:"total_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	UsedPercent float64 `json:"used_percent"`
}
type Snapshot struct {
	SchemaVersion    string    `json:"schema_version"`
	CollectorVersion string    `json:"collector_version"`
	CollectedAt      time.Time `json:"collected_at"`
	AgentID          string    `json:"agent_id"`
	Hostname         string    `json:"hostname"`
	OS               string    `json:"os"`
	Arch             string    `json:"arch"`
	UptimeSeconds    uint64    `json:"uptime_seconds"`
	CPU              CPU       `json:"cpu"`
	Memory           Memory    `json:"memory"`
	Disks            []Disk    `json:"disks"`
}

func round2(v float64) float64 {
	if v < 0 {
		return float64(int(v*100-0.5)) / 100
	}
	return float64(int(v*100+0.5)) / 100
}
func systemTimes() (idle, kernel, user uint64, err error) {
	var i, k, u filetime
	r, _, e := procGetSystemTimes.Call(uintptr(unsafe.Pointer(&i)), uintptr(unsafe.Pointer(&k)), uintptr(unsafe.Pointer(&u)))
	if r == 0 {
		if e != syscall.Errno(0) {
			return 0, 0, 0, e
		}
		return 0, 0, 0, errors.New("GetSystemTimes failed")
	}
	return i.u64(), k.u64(), u.u64(), nil
}
func collectCPU(sample time.Duration) (CPU, error) {
	i1, k1, u1, e := systemTimes()
	if e != nil {
		return CPU{}, e
	}
	time.Sleep(sample)
	i2, k2, u2, e := systemTimes()
	if e != nil {
		return CPU{}, e
	}
	idle := i2 - i1
	total := (k2 - k1) + (u2 - u1)
	if total == 0 {
		return CPU{SampleMS: sample.Milliseconds()}, nil
	}
	pct := float64(total-idle) / float64(total) * 100
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	return CPU{UsagePercent: round2(pct), SampleMS: sample.Milliseconds()}, nil
}
func collectMemory() (Memory, error) {
	var m memoryStatusEx
	m.Length = uint32(unsafe.Sizeof(m))
	r, _, e := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m)))
	if r == 0 {
		if e != syscall.Errno(0) {
			return Memory{}, e
		}
		return Memory{}, errors.New("GlobalMemoryStatusEx failed")
	}
	usedPF := uint64(0)
	if m.TotalPageFile >= m.AvailPageFile {
		usedPF = m.TotalPageFile - m.AvailPageFile
	}
	return Memory{UsedPercent: round2(float64(m.MemoryLoad)), TotalBytes: m.TotalPhys, AvailableBytes: m.AvailPhys, PageFileTotalBytes: m.TotalPageFile, PageFileUsedBytes: usedPF}, nil
}
func collectDisks() ([]Disk, error) {
	mask, _, e := procGetLogicalDrives.Call()
	if mask == 0 {
		if e != syscall.Errno(0) {
			return nil, e
		}
		return nil, errors.New("GetLogicalDrives failed")
	}
	out := []Disk{}
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		root := fmt.Sprintf("%c:\\", 'A'+i)
		p, _ := syscall.UTF16PtrFromString(root)
		typ, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(p)))
		if typ != driveFixed {
			continue
		}
		var avail, total, free uint64
		r, _, _ := procGetDiskFreeSpaceExW.Call(uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&avail)), uintptr(unsafe.Pointer(&total)), uintptr(unsafe.Pointer(&free)))
		if r == 0 || total == 0 {
			continue
		}
		used := total - free
		out = append(out, Disk{Mount: root, TotalBytes: total, FreeBytes: free, UsedBytes: used, UsedPercent: round2(float64(used) / float64(total) * 100)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Mount < out[j].Mount })
	return out, nil
}
func uptime() uint64                { ms, _, _ := procGetTickCount64.Call(); return uint64(ms) / 1000 }
func normalizeBase(s string) string { return strings.TrimRight(strings.TrimSpace(s), "/") }

func post(ctx context.Context, client *http.Client, url, key string, v any) error {
	b, e := json.Marshal(v)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-sparem-key", key)
	req.Header.Set("User-Agent", "SPARE-M-Collector/"+version)
	resp, e := client.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("cloud returned %s", resp.Status)
	}
	return nil
}
func snapshot(agentID string) (Snapshot, error) {
	h, e := os.Hostname()
	if e != nil {
		h = "unknown"
	}
	cpu, e := collectCPU(650 * time.Millisecond)
	if e != nil {
		return Snapshot{}, e
	}
	mem, e := collectMemory()
	if e != nil {
		return Snapshot{}, e
	}
	disks, e := collectDisks()
	if e != nil {
		return Snapshot{}, e
	}
	if agentID == "" {
		agentID = h
	}
	return Snapshot{SchemaVersion: "sparem.host.v1", CollectorVersion: version, CollectedAt: time.Now().UTC(), AgentID: agentID, Hostname: h, OS: "windows", Arch: runtime.GOARCH, UptimeSeconds: uptime(), CPU: cpu, Memory: mem, Disks: disks}, nil
}
func main() {
	cloud := flag.String("cloud-url", os.Getenv("SPAREM_CLOUD_URL"), "Vercel app base URL")
	key := flag.String("ingest-key", os.Getenv("SPAREM_INGEST_KEY"), "shared ingest key")
	interval := flag.Duration("interval", 30*time.Second, "host collection interval")
	agentID := flag.String("agent-id", os.Getenv("SPAREM_AGENT_ID"), "stable host identifier; default hostname")
	once := flag.Bool("once", false, "collect and send once")
	flag.Parse()
	base := normalizeBase(*cloud)
	if base == "" || *key == "" {
		fmt.Fprintln(os.Stderr, "SPAREM_CLOUD_URL/--cloud-url and SPAREM_INGEST_KEY/--ingest-key are required")
		os.Exit(2)
	}
	endpoint := base + "/api/ingest/host"
	client := &http.Client{Timeout: 12 * time.Second}
	send := func(ctx context.Context) {
		s, e := snapshot(*agentID)
		if e != nil {
			fmt.Fprintln(os.Stderr, "collect:", e)
			return
		}
		if e = post(ctx, client, endpoint, *key, s); e != nil {
			fmt.Fprintln(os.Stderr, "send:", e)
			return
		}
		fmt.Printf("[%s] sent host sample cpu=%.1f mem=%.1f disks=%d\n", time.Now().Format(time.RFC3339), s.CPU.UsagePercent, s.Memory.UsedPercent, len(s.Disks))
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	send(ctx)
	if *once {
		return
	}
	t := time.NewTicker(*interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			send(ctx)
		}
	}
}
