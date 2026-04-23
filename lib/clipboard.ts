// Enhanced clipboard utility specifically optimized for mobile Safari
export const copyToClipboard = (text: string): Promise<boolean> => {
  return new Promise((resolve) => {
    
    // Method 1: Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          resolve(true);
        })
        .catch((err) => {
          // Fall back to execCommand
          fallbackCopy(text, resolve);
        });
    } else {
      // Use fallback immediately
      fallbackCopy(text, resolve);
    }
  });
};

// Enhanced fallback method for mobile Safari
const fallbackCopy = (text: string, resolve: (success: boolean) => void) => {
  
  try {
    // Method 1: Try with a visible textarea (works better on mobile)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '50%';
    textarea.style.top = '50%';
    textarea.style.transform = 'translate(-50%, -50%)';
    textarea.style.zIndex = '9999';
    textarea.style.opacity = '0.1';
    textarea.style.width = '200px';
    textarea.style.height = '100px';
    textarea.style.fontSize = '16px'; // Prevents zoom on iOS
    textarea.style.border = '1px solid #ccc';
    textarea.style.backgroundColor = '#fff';
    textarea.style.color = '#000';
    textarea.readOnly = true;
    
    document.body.appendChild(textarea);
    
    // Focus and select on mobile
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    
    const successful = document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textarea);
    
    if (successful) {
      resolve(true);
      return;
    }
    
    // Method 2: Try with input element
    const input = document.createElement('input');
    input.value = text;
    input.style.position = 'fixed';
    input.style.left = '50%';
    input.style.top = '50%';
    input.style.transform = 'translate(-50%, -50%)';
    input.style.zIndex = '9999';
    input.style.opacity = '0.01';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.fontSize = '16px';
    input.readOnly = true;
    
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    
    const inputSuccessful = document.execCommand('copy');
    document.body.removeChild(input);
    
    if (inputSuccessful) {
      resolve(true);
      return;
    }
    
    resolve(false);
    
  } catch (err) {
    resolve(false);
  }
};

// Copy with user feedback
export const copyWithFeedback = async (text: string, onSuccess?: () => void, onError?: () => void) => {
  
  if (!text) {
    onError?.();
    return false;
  }
  
  const success = await copyToClipboard(text);
  
  if (success) {
    onSuccess?.();
  } else {
    onError?.();
  }
  
  return success;
};

 