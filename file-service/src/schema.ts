import { z } from 'zod';

// Backend ile mikroservis arasındaki ortak sözleşme (contract).
// Servis veriyi YORUMLAMAZ; sadece verilen kolon/satırları dosyaya döker.
export const columnSchema = z.object({
  header: z.string().max(120),
  key: z.string().min(1).max(60),
  width: z.number().positive().max(200).optional(),
});

// Hücre değerleri ilkel tiplerle sınırlı — servis iş mantığı içermez.
const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const generateSchema = z.object({
  title: z.string().max(160).optional(),
  filename: z.string().max(120).optional(),
  sheetName: z.string().max(31).optional(), // Excel sayfa adı limiti 31 karakter
  columns: z.array(columnSchema).min(1).max(60),
  rows: z.array(z.record(cellSchema)).max(100_000),
});

export type Column = z.infer<typeof columnSchema>;
export type GeneratePayload = z.infer<typeof generateSchema>;
