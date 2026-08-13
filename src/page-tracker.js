export class PageTracker {
  constructor(eventTracker) {
    this.eventTracker = eventTracker;
    this.previousRoute = null;
  }

  trackScreenView(currentRoute, eventName = 'screen_viewed', properties = {}) {
    if (currentRoute.includes('/login') || currentRoute.includes('/forgot-password')) {
      return;
    }

    const entryMethod = this.previousRoute ? 'navigation' : 'direct_load';

    this.eventTracker.trackEvent(eventName, {
      route: currentRoute,
      entryMethod: entryMethod,
      ...properties
    });

    this.previousRoute = currentRoute;
  }
}
