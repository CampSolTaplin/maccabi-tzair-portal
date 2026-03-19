import * as XLSX from 'xlsx';

/* ─── Types ─── */

export interface RosterRow {
  fullName: string;
  gender: string | null;
  age: number | null;
  grade: string | null;
  school: string | null;
  allergies: string | null;
  emails: string | null;
  contactId: string;
  accountId: string;
  accountName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  courseOptionName: string;
  courseOptionId: string;
}

/* ─── Column Mapping ─── */

const COLUMN_MAP: Record<string, keyof RosterRow> = {
  'Registration: Contact: Full Name': 'fullName',
  'Contact: Gender': 'gender',
  'Contact: Age': 'age',
  'Contact: Grade': 'grade',
  'Contact: School': 'school',
  'Contact: Allergies': 'allergies',
  'Contact: All Emails': 'emails',
  'Contact: Contact ID': 'contactId',
  'Registration: Account: Account ID': 'accountId',
  'Registration: Account: Account Name': 'accountName',
  'Registration: Account: Primary Contact Email': 'parentEmail',
  'Registration: Account: Phone': 'parentPhone',
  'Registration: Account: Emergency Contact 1 Name': 'emergencyName',
  'Registration: Account: Emergency Contact 1 Cell Phone': 'emergencyPhone',
  'Full Course Option Name': 'courseOptionName',
  'Course Option: Course Option ID': 'courseOptionId',
};

/* ─── Parser ─── */

/**
 * Parse a CSV or XLSX file buffer into an array of RosterRow objects.
 */
export function parseRosterFile(buffer: Buffer, filename: string): RosterRow[] {
  const ext = filename.toLowerCase().split('.').pop();

  let workbook: XLSX.WorkBook;

  if (ext === 'csv') {
    const text = buffer.toString('utf-8');
    workbook = XLSX.read(text, { type: 'string' });
  } else if (ext === 'xlsx' || ext === 'xls') {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    throw new Error(`Unsupported file type: .${ext}. Please upload a .csv, .xlsx, or .xls file.`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded file has no sheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  if (rawRows.length === 0) {
    throw new Error('The uploaded file has no data rows.');
  }

  // Validate that required columns exist
  const firstRowKeys = Object.keys(rawRows[0]);
  const missingColumns: string[] = [];
  for (const header of Object.keys(COLUMN_MAP)) {
    if (!firstRowKeys.includes(header)) {
      missingColumns.push(header);
    }
  }

  // Only require the critical columns
  const criticalColumns = [
    'Registration: Contact: Full Name',
    'Contact: Contact ID',
    'Registration: Account: Account ID',
    'Full Course Option Name',
    'Course Option: Course Option ID',
  ];
  const missingCritical = criticalColumns.filter((c) => missingColumns.includes(c));
  if (missingCritical.length > 0) {
    throw new Error(
      `Missing required columns: ${missingCritical.join(', ')}. ` +
        `Found columns: ${firstRowKeys.slice(0, 10).join(', ')}${firstRowKeys.length > 10 ? '...' : ''}`
    );
  }

  const rows: RosterRow[] = [];

  for (const raw of rawRows) {
    const row: Partial<RosterRow> = {};

    for (const [header, field] of Object.entries(COLUMN_MAP)) {
      const value = raw[header];

      if (field === 'age') {
        row[field] = value != null ? Number(value) || null : null;
      } else if (
        field === 'fullName' ||
        field === 'contactId' ||
        field === 'accountId' ||
        field === 'courseOptionName' ||
        field === 'courseOptionId'
      ) {
        // Required string fields
        row[field] = value != null ? String(value).trim() : '';
      } else {
        // Nullable string fields
        row[field] = value != null && String(value).trim() !== '' ? String(value).trim() : null;
      }
    }

    // Skip rows with missing critical data
    if (!row.fullName || !row.contactId || !row.courseOptionName) {
      continue;
    }

    rows.push(row as RosterRow);
  }

  return rows;
}
