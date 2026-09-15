import {buildTraceIntelligenceSet} from './trace';
import {buildSemanticCatalog} from './semantic';
import {discoverJourneys} from './journey';
import {buildBaselines} from './baseline';
import {buildEvidenceGraph} from './evidence';
import {buildCoverageIntelligence} from './coverage';

export function buildIntelligence({spans,previousSpans,infra,correlation}){
 const semantic=buildSemanticCatalog(spans);
 const journey=discoverJourneys(spans);
 const traces=buildTraceIntelligenceSet(spans,40);
 const baselines=buildBaselines(spans,previousSpans||[]);
 const evidence=buildEvidenceGraph({journeyDiscovery:journey,semanticCatalog:semantic,traceIntelligence:traces,baselines,infra,correlation});
 const coverage=buildCoverageIntelligence({spans,infra,journey,traces,baselines,evidence});
 return {
  version:'0.2.0',
  semantic:{operations:semantic.slice(0,60)},
  journey,
  traces,
  baselines,
  evidence,
  coverage,
  capabilities:{trace_intelligence:true,semantic_classification:true,journey_discovery:true,entity_baselines:true,evidence_graph:true,coverage_intelligence:true,telemetry_planner:true,agentic_investigation:Boolean(process.env.OPENAI_API_KEY),adaptive_telemetry:false,profiles:false,change_intelligence:false,incident_memory:false}
 };
}
