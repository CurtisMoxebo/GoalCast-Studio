export type DirectMediaType = 'text' | 'photo' | 'video';

export interface DirectPostPlatformMeta {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  supportedMediaTypes: DirectMediaType[];
  configured: boolean;
}

export interface DirectPostPayload {
  mediaType: DirectMediaType;
  mediaPath?: string;
  filename?: string;
  description: string;
}

export interface DirectPostResult {
  platform: string;
  platformName: string;
  status: 'SUCCESS' | 'FAILED';
  remotePostId?: string;
  remoteUrl?: string;
  error?: string;
}

export interface IDirectPostPublisher {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly color: string;
  readonly supportedMediaTypes: DirectMediaType[];
  isConfigured(): boolean;
  publish(payload: DirectPostPayload): Promise<DirectPostResult>;
}
