export interface AtsBoard {
  provider: 'greenhouse' | 'lever' | 'ashby' | 'personio';
  board: string;
  company: string;
  countries?: string[];
  regions?: string[];
  global?: boolean;
}
