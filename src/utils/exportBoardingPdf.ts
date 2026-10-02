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
      scale: quality,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        // Reset transforms on cloned element and all ancestors to avoid clipping/distortion
        const allTransformed = clonedDoc.querySelectorAll('[style*="transform"]');
        allTransformed.forEach((el) => {
          (el as HTMLElement).style.transform = 'none';
        });
      },
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

    const margin = 5; // 5mm margin for maximum printable area
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2;

    // Scale proportionally to fit within A4 page without clipping signatures or totals
    const scaleFactor = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const imgWidth = canvas.width * scaleFactor;
    const imgHeight = canvas.height * scaleFactor;

    const x = margin + (availableWidth - imgWidth) / 2;
    const y = margin + (availableHeight - imgHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
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
    const margin = 5;
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
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const allTransformed = clonedDoc.querySelectorAll('[style*="transform"]');
          allTransformed.forEach((e) => {
            (e as HTMLElement).style.transform = 'none';
          });
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const scaleFactor = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      const imgWidth = canvas.width * scaleFactor;
      const imgHeight = canvas.height * scaleFactor;

      const x = margin + (availableWidth - imgWidth) / 2;
      const y = margin + (availableHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
    }

    pdf.save(fileName);
  } catch (error) {
    console.error('Error exporting multi-page PDF:', error);
    throw error;
  }
}
