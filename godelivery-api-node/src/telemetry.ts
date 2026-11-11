import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '');
  const sdk = new NodeSDK({
    serviceName: 'godelivery-api-node',
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }) })],
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on('SIGTERM', () => { void sdk.shutdown(); });
}
