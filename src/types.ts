export interface Filter {
  id: string;
  pattern: string;
  regex: boolean;
  foreground: string;
  background: string;
  enabled: boolean;
  bold?: boolean;
  italic?: boolean;
  highlightWholeLine?: boolean;
  caseSensitive?: boolean;
}

export interface FilterGroup {
  name: string;
  enabled: boolean;
  filters: Filter[];
}
