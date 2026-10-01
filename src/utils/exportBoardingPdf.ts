import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ExportPdfOptions {
  fileName?: string;
  orientation?: 'landscape' | 'portrait';
  quality?: number;
}

/**
 * Capture an HTMLElement and export it to a high-quality PDF file.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  options: ExportPdfOptions = {}
): Promise<void> {
  const {
    fileName = 'So_Cham_An_Ban_Tru.pdf',
    orientation = 'landscape',
    quality = 2,
  } = options;

  try {
    const canvas = await html2canvas(element, {
      scale: quality, // Crisp text rendering
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = orientation === 'landscape' ? 297 : 210;
    const pdfHeight = orientation === 'landscape' ? 210 : 297;

    const margin = 6; // 6mm margin
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2;

    const imgWidth = availableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const x = margin;
    const y = margin;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, Math.min(imgHeight, availableHeight));
    pdf.save(fileName);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  }
}

/**
 * Capture multiple HTMLElements and export each as a separate page in a single PDF.
 */
export async function exportElementsToMultiPagePdf(
  elements: HTMLElement[],
  options: ExportPdfOptions = {}
): Promise<void> {
  const {
    fileName = 'So_Cham_An_Ban_Tru_2_Trang.pdf',
    orientation = 'landscape',
    quality = 2,
  } = options;

  if (!elements || elements.length === 0) return;

  try {
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = orientation === 'landscape' ? 297 : 210;
    const pdfHeight = orientation === 'landscape' ? 210 : 297;
    const margin = 6;
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (i > 0) {
        pdf.addPage('a4', orientation);
      }

      const canvas = await html2canvas(el, {
        scale: quality,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = availableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, availableHeight));
    }

    pdf.save(fileName);
  } catch (error) {
    console.error('Error exporting multi-page PDF:', error);
    throw error;
  }
}
