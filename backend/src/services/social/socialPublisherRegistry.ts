import { ISocialPublisher, SocialPlatformId } from './types';

export class SocialPublisherRegistry {
  private publishers: Map<SocialPlatformId | string, ISocialPublisher> = new Map();

  /**
   * Register a new social media publisher adapter
   */
  public register(publisher: ISocialPublisher): void {
    this.publishers.set(publisher.id, publisher);
    console.log(`[SocialRegistry] 🔌 Registered social publisher: "${publisher.name}" (${publisher.id})`);
  }

  /**
   * Get a publisher by platform id
   */
  public get(id: SocialPlatformId | string): ISocialPublisher | undefined {
    return this.publishers.get(id);
  }

  /**
   * Get all registered publishers in execution sequence
   */
  public getAll(): ISocialPublisher[] {
    return Array.from(this.publishers.values());
  }

  /**
   * Get list of all registered platform IDs
   */
  public getPlatformIds(): (SocialPlatformId | string)[] {
    return Array.from(this.publishers.keys());
  }
}

export const socialPublisherRegistry = new SocialPublisherRegistry();
