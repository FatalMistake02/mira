import type { FrozenTabState } from './types';

/**
 * Webview interface for tab state management.
 */
interface WebviewElement {
  executeJavaScript?: (code: string) => Promise<any>;
  [key: string]: any;
}

/**
 * Captures the current state of a webview for preservation during freeze.
 */
export async function captureTabState(webview: WebviewElement | null): Promise<FrozenTabState | null> {
  if (!webview) return null;

  try {
    const now = Date.now();
    
    // Get scroll position - for webview elements, we need to use executeJavaScript
    const scroll = await webview.executeJavaScript?.(`
      ({
        scrollX: window.scrollX || document.documentElement.scrollLeft || 0,
        scrollY: window.scrollY || document.documentElement.scrollTop || 0
      })
    `).catch(() => ({ scrollX: 0, scrollY: 0 })) || { scrollX: 0, scrollY: 0 };
    
    // Capture form data via JavaScript injection
    const formData = await webview.executeJavaScript?.(`
      (function() {
        const formData = [];
        const inputs = document.querySelectorAll('input, textarea, select');
        
        inputs.forEach((element) => {
          if (!element.id && !element.name) return;
          
          const data = {
            id: element.id || '',
            name: element.name || '',
            type: element.type || element.tagName.toLowerCase(),
            value: element.value || '',
          };
          
          if (element.type === 'checkbox' || element.type === 'radio') {
            data.checked = element.checked;
          }
          
          if (element.tagName.toLowerCase() === 'select') {
            data.selectedIndex = element.selectedIndex;
          }
          
          formData.push(data);
        });
        
        return formData;
      })()
    `).catch(() => []) || [];
    
    // Capture text selections via JavaScript injection
    const textSelections = await webview.executeJavaScript?.(`
      (function() {
        const textSelections = [];
        const selection = window.getSelection();
        
        if (selection && selection.rangeCount > 0) {
          for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            const text = range.toString();
            
            if (text.trim()) {
              textSelections.push({
                start: range.startOffset,
                end: range.endOffset,
                text,
                elementId: range.commonAncestorContainer.parentElement?.id,
              });
            }
          }
        }
        
        return textSelections;
      })()
    `).catch(() => []) || [];
    
    // Get focused element via JavaScript injection
    const focusedElementId = await webview.executeJavaScript?.(`
      (function() {
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body) {
          return activeElement.id || undefined;
        }
        return undefined;
      })()
    `).catch(() => undefined) || undefined;
    
    return {
      scrollX: scroll.scrollX,
      scrollY: scroll.scrollY,
      formData,
      textSelections,
      focusedElementId,
      timestamp: now,
    };
  } catch (error) {
    console.warn('Failed to capture tab state:', error);
    return null;
  }
}

/**
 * Restores a previously captured tab state.
 */
export function restoreTabState(webview: WebviewElement | null, state: FrozenTabState): boolean {
  if (!webview || !state) return false;

  try {
    // Restore scroll position
    webview.executeJavaScript?.(`
      window.scrollTo(${state.scrollX}, ${state.scrollY});
    `).catch(() => undefined);
    
    // Restore form data
    if (state.formData.length > 0) {
      webview.executeJavaScript?.(`
        (function() {
          const formData = ${JSON.stringify(state.formData)};
          
          formData.forEach((data) => {
            let element = null;
            
            if (data.id) {
              element = document.querySelector('#' + data.id);
            }
            if (!element && data.name) {
              element = document.querySelector('[name="' + data.name + '"]');
            }
            
            if (!element) return;
            
            if (element.value !== undefined) {
              element.value = data.value;
            }
            
            if ((data.type === 'checkbox' || data.type === 'radio') && data.checked !== undefined) {
              element.checked = data.checked;
            }
            
            if (element.tagName.toLowerCase() === 'select' && data.selectedIndex !== undefined) {
              element.selectedIndex = data.selectedIndex;
            }
          });
        })()
      `).catch(() => undefined);
    }
    
    // Restore focus
    if (state.focusedElementId) {
      webview.executeJavaScript?.(`
        (function() {
          const element = document.querySelector('#${state.focusedElementId}');
          if (element && typeof element.focus === 'function') {
            element.focus();
          }
        })()
      `).catch(() => undefined);
    }
    
    return true;
  } catch (error) {
    console.warn('Failed to restore tab state:', error);
    return false;
  }
}

/**
 * Injects JavaScript to suspend execution in a webview.
 */
export function suspendJavaScript(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    // This would be implemented via Electron's webview API
    // For now, we'll use a placeholder that injects a script to pause execution
    webview.executeJavaScript?.(`
      // Placeholder for JavaScript suspension
      console.log('JavaScript suspension requested');
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to suspend JavaScript:', error);
  }
}

/**
 * Injects JavaScript to resume execution in a webview.
 */
export function resumeJavaScript(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    // This would be implemented via Electron's webview API
    // For now, we'll use a placeholder that injects a script to resume execution
    webview.executeJavaScript?.(`
      // Placeholder for JavaScript resumption
      console.log('JavaScript resumption requested');
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to resume JavaScript:', error);
  }
}

/**
 * Pauses CSS animations and transitions.
 */
export function pauseAnimations(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    webview.executeJavaScript?.(`
      (function() {
        // Remove any existing freeze animation styles
        const existingStyle = document.querySelector('style[data-mira-freeze-animations="true"]');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        // Add new freeze animation styles
        const style = document.createElement('style');
        style.textContent = \`
          *, *::before, *::after {
            animation-play-state: paused !important;
            transition-play-state: paused !important;
          }
        \`;
        style.setAttribute('data-mira-freeze-animations', 'true');
        document.head.appendChild(style);
      })()
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to pause animations:', error);
  }
}

/**
 * Resumes CSS animations and transitions.
 */
export function resumeAnimations(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    webview.executeJavaScript?.(`
      (function() {
        const style = document.querySelector('style[data-mira-freeze-animations="true"]');
        if (style) {
          style.remove();
        }
      })()
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to resume animations:', error);
  }
}

/**
 * Throttles timers (setTimeout/setInterval) in a webview.
 */
export function throttleTimers(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    webview.executeJavaScript?.(`
      (function() {
        // Placeholder for timer throttling
        // In a real implementation, this would override setTimeout and setInterval
        console.log('Timer throttling requested');
      })()
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to throttle timers:', error);
  }
}

/**
 * Restores normal timer behavior in a webview.
 */
export function restoreTimers(webview: WebviewElement | null): void {
  if (!webview) return;
  
  try {
    webview.executeJavaScript?.(`
      (function() {
        // Placeholder for timer restoration
        // In a real implementation, this would restore original timer functions
        console.log('Timer restoration requested');
      })()
    `).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to restore timers:', error);
  }
}
