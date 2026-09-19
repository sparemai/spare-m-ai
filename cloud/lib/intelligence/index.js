import {buildTraceIntelligenceSet} from './trace';
import {buildSemanticCatalog} from './semantic';
import {discoverJourneys} from './journey';
import {buildBaselines} from './baseline';
import {buildEvidenceGraph} from './evidence';
import {buildCoverageIntelligence} from './coverage';

export function buildIntelligence({spans,previousSpans,infra,correlation,events=[]}){
 const semantic=buildSemanticCatalog(spans);
 const journey=discoverJourneys(spans);
 const traces=buildTraceIntelligenceSet(spans,40);
 const baselines=buildBaselines(spans,previousSpans||[]);
 const evidence=buildEvidenceGraph({journeyDiscovery:journey,semanticCatalog:semantic,traceIntelligence:traces,baselines,infra,correlation});
 const coverage=buildCoverageIntelligence({spans,infra,journey,traces,baselines,evidence,events});
 const eventTypes=new Set((events||[]).map(e=>String(e.type||'').toLowerCase()));
 return {
  version:'0.3.0',
  semantic:{operations:semantic.slice(0,60)},
  journey,
  traces,
  baselines,
  evidence,
  coverage,
  capabilities:{trace_intelligence:true,semantic_classification:true,journey_discovery:true,entity_baselines:true,evidence_graph:true,coverage_intelligence:true,telemetry_planner:true,agentic_investigation:Boolean(process.env.OPENAI_API_KEY),process_monitoring:eventTypes.has('process'),runtime_metrics:eventTypes.has('runtime'),logs:eventTypes.has('logs'),network_telemetry:eventTypes.has('network'),disk_performance:eventTypes.has('disk'),rum:eventTypes.has('rum'),database_intelligence:eventTypes.has('database'),kubernetes:eventTypes.has('kubernetes'),cloud_metrics:eventTypes.has('cloud'),business_events:eventTypes.has('business'),profiles:eventTypes.has('profile'),change_intelligence:eventTypes.has('change'),adaptive_telemetry:false,incident_memory:false}
 };
}
