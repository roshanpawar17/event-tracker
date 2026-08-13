export class UserInteractivity {
  constructor(config, eventTracker) {
    this.config = config;
    this.eventTracker = eventTracker;
    this.hasStarted = false;
    this.handleEvent = this.handleEvent.bind(this);
  }

  start() {
    if (this.hasStarted || typeof document === 'undefined') return;
    this.hasStarted = true;

    document.addEventListener('click', this.handleEvent, true);
    document.addEventListener('change', this.handleEvent, true);
  }

  stop() {
    if (!this.hasStarted || typeof document === 'undefined') return;
    this.hasStarted = false;

    document.removeEventListener('click', this.handleEvent, true);
    document.removeEventListener('change', this.handleEvent, true);
  }

  handleEvent(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    const trackAttr = this.config?.trackAttributeName || 'data-track-id';
    const elementWithId = target.closest(`[id], [${trackAttr}]`);
    if (!elementWithId) return;

    const targetId = elementWithId.getAttribute(trackAttr) || elementWithId.id;
    if (!targetId) return;

    const mapping = this.findMappingByTargetId(targetId);
    if (!mapping) return;

    const properties = {
      targetId,
      ...mapping.properties
    };

    let dynamicText = elementWithId.dataset['label'] || 
                      elementWithId.getAttribute('aria-label') || 
                      (elementWithId.innerText ? elementWithId.innerText.trim() : '');
    
    if (dynamicText && dynamicText.includes('\n')) {
      dynamicText = dynamicText.split('\n')[0].trim();
    }

    if (dynamicText) {
      if (properties.button !== undefined) properties.button = dynamicText;
      if (properties.card !== undefined) properties.card = dynamicText;
      if (properties.label !== undefined) properties.label = dynamicText;
    }

    if (typeof this.config.extractDynamicProperties === 'function') {
      this.config.extractDynamicProperties(elementWithId, properties, event);
    }

    this.eventTracker.trackEvent(mapping.eventName, properties);
  }

  findMappingByTargetId(targetId) {
    if (!this.config.elementEventMap) return null;

    for (const [eventName, triggers] of Object.entries(this.config.elementEventMap)) {
      const match = triggers.find(t => 
        Array.isArray(t.targetId) ? t.targetId.includes(targetId) : t.targetId === targetId
      );
      if (match) {
        return { eventName, properties: match.properties };
      }
    }
    return null;
  }
}
