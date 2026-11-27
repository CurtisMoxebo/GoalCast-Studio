import { DirectPostPlatformMeta, IDirectPostPublisher } from './types';
import { TelegramDirectPublisher } from './publishers/telegramPublisher';

/**
 * Extensible registry for direct photo/video social media publishers.
 * Additional platforms (e.g., X/Twitter, WhatsApp, Discord, Facebook Page) can be
 * registered here without modifying route or UI contracts.
 */
export class DirectPostRegistry {
  private publishers: Map<string, IDirectPostPublisher> = new Map();

  public register(publisher: IDirectPostPublisher): void {
    this.publishers.set(publisher.id, publisher);
    console.log(`[DirectPostRegistry] 🔌 Registered direct-post publisher: "${publisher.name}" (${publisher.id})`);
  }

  public get(id: string): IDirectPostPublisher | undefined {
    return this.publishers.get(id);
  }

  public getAll(): IDirectPostPublisher[] {
    return Array.from(this.publishers.values());
  }

  public getPlatformMetadata(): DirectPostPlatformMeta[] {
    return this.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: p.subtitle,
      color: p.color,
      supportedMediaTypes: p.supportedMediaTypes,
      configured: p.isConfigured()
    }));
  }
}

export const directPostRegistry = new DirectPostRegistry();

// Register default direct-post publishers (more platforms can be added here later)
directPostRegistry.register(new TelegramDirectPublisher());
