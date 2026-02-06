// Simple in-memory metrics for Prometheus exposition
// For production, consider using prom-client package

interface Counter {
  value: number;
  labels: Record<string, number>; // Key is JSON-stringified labels, value is count
}

interface Histogram {
  count: number;
  sum: number;
  buckets: Record<string, number>;
}

class Metrics {
  private counters: Record<string, Counter> = {};
  private histograms: Record<string, Histogram> = {};

  // Auth metrics
  readonly AUTH_CHALLENGE_TOTAL = 'ipfs_auth_challenge_total';
  readonly AUTH_VERIFY_TOTAL = 'ipfs_auth_verify_total';
  readonly AUTH_VERIFY_SUCCESS = 'ipfs_auth_verify_success_total';
  readonly AUTH_VERIFY_FAILURE = 'ipfs_auth_verify_failure_total';

  // Upload metrics
  readonly UPLOAD_TOTAL = 'ipfs_upload_total';
  readonly UPLOAD_SUCCESS = 'ipfs_upload_success_total';
  readonly UPLOAD_FAILURE = 'ipfs_upload_failure_total';
  readonly UPLOAD_BYTES = 'ipfs_upload_bytes_total';

  // Rate limit metrics
  readonly RATE_LIMIT_EXCEEDED = 'ipfs_rate_limit_exceeded_total';

  // Account check metrics
  readonly ACCOUNT_CHECK_TOTAL = 'ipfs_account_check_total';
  readonly ACCOUNT_CHECK_PASSED = 'ipfs_account_check_passed_total';
  readonly ACCOUNT_CHECK_FAILED = 'ipfs_account_check_failed_total';

  constructor() {
    // Initialize counters
    const counterNames = [
      this.AUTH_CHALLENGE_TOTAL,
      this.AUTH_VERIFY_TOTAL,
      this.AUTH_VERIFY_SUCCESS,
      this.AUTH_VERIFY_FAILURE,
      this.UPLOAD_TOTAL,
      this.UPLOAD_SUCCESS,
      this.UPLOAD_FAILURE,
      this.UPLOAD_BYTES,
      this.RATE_LIMIT_EXCEEDED,
      this.ACCOUNT_CHECK_TOTAL,
      this.ACCOUNT_CHECK_PASSED,
      this.ACCOUNT_CHECK_FAILED,
    ];

    for (const name of counterNames) {
      this.counters[name] = { value: 0, labels: {} };
    }
  }

  inc(name: string, labels?: Record<string, string>, value = 1): void {
    const counter = this.counters[name];
    if (!counter) return;

    counter.value += value;

    if (labels) {
      const labelKey = JSON.stringify(labels);
      counter.labels[labelKey] = (counter.labels[labelKey] || 0) + value;
    }
  }

  // Generate Prometheus exposition format
  expose(): string {
    const lines: string[] = [];

    for (const [name, counter] of Object.entries(this.counters)) {
      lines.push(`# HELP ${name} Counter metric`);
      lines.push(`# TYPE ${name} counter`);

      if (Object.keys(counter.labels).length === 0) {
        lines.push(`${name} ${counter.value}`);
      } else {
        for (const [labelKey, value] of Object.entries(counter.labels)) {
          const labels = JSON.parse(labelKey);
          const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          lines.push(`${name}{${labelStr}} ${value}`);
        }
      }
    }

    return lines.join('\n');
  }

  // Get current values (for logging/debugging)
  getValues(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [name, counter] of Object.entries(this.counters)) {
      result[name] = counter.value;
    }
    return result;
  }
}

export const metrics = new Metrics();
