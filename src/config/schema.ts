import { z } from 'zod';

const ViewportSchema = z.object({
  width:  z.number().int().positive(),
  height: z.number().int().positive(),
  label:  z.string().optional(),
});

const FormConfigSchema = z.object({
  url:             z.string(),
  fields:          z.record(z.string()),
  submitSelector:  z.string(),
  successSelector: z.string(),
});

const EndpointSchema = z.object({
  url:                z.string(),
  method:             z.enum(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']).default('GET'),
  expectedStatus:     z.number().int(),
  responseSchema:     z.record(z.unknown()).optional(),
  latencyThresholdMs: z.number().int().positive().optional(),
  headers:            z.record(z.string()).optional(),
  body:               z.unknown().optional(),
  sendAuth:           z.boolean().default(true),
});

const AuthConfigSchema = z.object({
  type:  z.enum(['bearer', 'basic', 'apikey']),
  token: z.string().optional(),
  key:   z.string().optional(),
  value: z.string().optional(),
});

export const ConfigSchema = z.object({
  targetDir:           z.string().default('./'),
  outputFormat:        z.array(z.enum(['html','json','markdown'])).default(['html','json']),
  outputDir:           z.string().default('./qa-report'),
  stack:               z.string().optional(),
  navigationTimeoutMs: z.number().int().positive().default(30000),
  services:            z.record(z.string()).default({}),

  security: z.object({
    skipCveCheck:       z.boolean().default(false),
    secretsPatterns:    z.array(z.string()).default([]),
    protectedEndpoints: z.array(z.string()).default([]),
  }).default({}),

  api: z.object({
    openApiPath:        z.string().optional(),
    routesPath:         z.string().optional(),
    latencyThresholdMs: z.number().int().positive().default(2000),
    auth:               AuthConfigSchema.optional(),
    endpoints:          z.array(EndpointSchema).default([]),
  }).default({}),

  ui: z.object({
    urls:        z.array(z.string()).default([]),
    expectedTitle: z.string().optional(),
    breakpoints: z.array(ViewportSchema).default([
      { width: 1920, height: 1080, label: 'Desktop' },
      { width: 768,  height: 1024, label: 'Tablet'  },
      { width: 375,  height: 812,  label: 'Mobile'  },
    ]),
    forms: z.array(FormConfigSchema).default([]),
  }).default({}),
});

export type Config   = z.infer<typeof ConfigSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type FormCfg  = z.infer<typeof FormConfigSchema>;
