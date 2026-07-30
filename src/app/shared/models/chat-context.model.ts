export interface ChatContextItem {
  id: string;
  name: string;
  kind: 'file' | 'database' | 'datagrid';
  extension?: string; // e.g. 'xlsx', 'pdf', 'csv', 'postgres', 'mysql'
  detail?: string;    // e.g. '1,030 rows · Patient_ID, Full_Name, City' or 'postgres'
  rowCount?: number;
  columns?: string[];
  raw?: any;
}

export interface ConversationContextSummary {
  filesCount: number;
  databasesCount: number;
  datagridsCount: number;
  totalCount: number;
  items: ChatContextItem[];
}
