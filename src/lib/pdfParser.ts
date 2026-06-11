import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Set up the worker for pdfjs-dist using a public CDN for Vite compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface ParsedResult {
  matricNo?: string;
  level?: number;
  semester?: number;
  gpa?: number;
  cgpa?: number;
  totalUnits?: number;
  success: boolean;
  error?: string;
}

export async function parsePdfResult(fileBuffer: ArrayBuffer): Promise<ParsedResult> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: fileBuffer });
    const pdf = await loadingTask.promise;
    
    // We only need the first page for the summary usually
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    
    const textItems = textContent.items as TextItem[];
    // Join text items or parse them sequentially
    const fullText = textItems.map(item => item.str).join(' ');
    
    const result: ParsedResult = { success: true };
    
    // 1. Matriculation Number
    const matricMatch = fullText.match(/\b(\d{11})\b/);
    if (matricMatch) {
      result.matricNo = matricMatch[1];
    }
    
    // 2. Level
    const levelMatch = fullText.match(/LEVEL:\s*(\d{3})/i);
    if (levelMatch) {
      result.level = parseInt(levelMatch[1], 10);
    }
    
    // 3. Semester
    const semesterMatch = fullText.match(/SEMESTER:\s*(First|Second)/i);
    if (semesterMatch) {
      result.semester = semesterMatch[1].toLowerCase() === 'first' ? 1 : 2;
    }
    
    // 4. GPA and CGPA
    // Summary row pattern: 12 numerical columns before "Mode Of Entry"
    // e.g., "21 21 91 4.33 0 148 148 143 577 23 3.90 14 UTME"
    const summaryPattern = /(\d+)\s+(\d+)\s+(\d+)\s+(\d\.\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d\.\d{2})/;
    const summaryMatch = fullText.match(summaryPattern);
    
    if (summaryMatch) {
      result.totalUnits = parseInt(summaryMatch[1], 10);
      result.gpa = parseFloat(summaryMatch[4]);
      result.cgpa = parseFloat(summaryMatch[11]);
    }
    
    return result;
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to parse PDF" };
  }
}
