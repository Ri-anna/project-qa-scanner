export type Status   = 'Pass' | 'Warn' | 'Fail' | 'Skipped';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type Level    = 'L1' | 'L2' | 'L3' | 'L4';

export interface Finding {
  status:         Status;
  finding:        string;
  severity:       Severity;
  recommendation: string;
  analyser:       string;
  level:          Level;
  timestamp:      string;
  metadata?:      Record<string, unknown>;
}

export function makeFinding(
  level:          Level,
  analyser:       string,
  status:         Status,
  severity:       Severity,
  finding:        string,
  recommendation: string,
  metadata?:      Record<string, unknown>,
): Finding {
  return { level, analyser, status, severity, finding, recommendation,
           timestamp: new Date().toISOString(), metadata };
}

export interface ScanResult {
  summary: {
    scannedAt:  string;
    targetDir:  string;
    stack:      string;
    byStatus:   Record<Status, number>;
    bySeverity: Record<Severity, number>;
    byLevel:    Record<Level, number>;
    narrative:  string;
  };
  findings: Finding[];
}
