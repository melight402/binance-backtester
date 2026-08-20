import html2canvas from 'html2canvas';

export async function captureScreenshot(element = document.body) {
  if (!element) throw new Error('Screenshot target is unavailable');

  try {
    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: false,
      scale: 1,
      logging: false,
      backgroundColor: '#131722',
    });

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create screenshot blob'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  } catch (error) {
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}
