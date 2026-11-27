import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { THEME } from '../constants/theme';
import {
  DIRECT_POST_DESCRIPTION_TEMPLATES,
  DirectPostTemplate
} from '../constants/config';
import { mobileApi } from '../services/api';
import { triggerHaptic } from '../utils/haptics';

export type DirectMediaType = 'text' | 'photo' | 'video';

export interface DirectPostPlatform {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  supportedMediaTypes: DirectMediaType[];
  configured: boolean;
}

interface PublishOutcomeItem {
  platform: string;
  platformName: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  remotePostId?: string;
  remoteUrl?: string;
  error?: string;
}

const DEFAULT_DIRECT_PLATFORMS: DirectPostPlatform[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    subtitle: 'Channel broadcast · Text, photo & caption',
    color: '#229ED9',
    supportedMediaTypes: ['text', 'photo', 'video'],
    configured: true
  }
];

const getPlatformIconName = (platformId: string): keyof typeof Ionicons.glyphMap => {
  switch (platformId) {
    case 'telegram':
      return 'paper-plane';
    case 'whatsapp':
      return 'logo-whatsapp';
    case 'facebook':
    case 'facebook_page':
      return 'logo-facebook';
    case 'instagram':
      return 'logo-instagram';
    case 'x':
    case 'x_twitter':
      return 'logo-twitter';
    default:
      return 'share-social';
  }
};

export const PostScreen: React.FC = () => {
  const [mediaType] = useState<DirectMediaType>('photo');
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; name: string } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    DIRECT_POST_DESCRIPTION_TEMPLATES[0].id
  );
  const [description, setDescription] = useState(DIRECT_POST_DESCRIPTION_TEMPLATES[0].content);

  const [platforms, setPlatforms] = useState<DirectPostPlatform[]>(DEFAULT_DIRECT_PLATFORMS);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['telegram']);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishPhase, setPublishPhase] = useState<'idle' | 'uploading' | 'publishing'>('idle');
  const [outcomes, setOutcomes] = useState<PublishOutcomeItem[]>([]);

  useEffect(() => {
    let mounted = true;
    mobileApi
      .fetchDirectPostPlatforms()
      .then((res) => {
        if (!mounted || !Array.isArray(res.platforms) || res.platforms.length === 0) return;
        setPlatforms(res.platforms);
        setSelectedPlatforms((prev) => {
          const validIds = res.platforms.map((p) => p.id);
          const filtered = prev.filter((id) => validIds.includes(id));
          return filtered.length > 0 ? filtered : validIds;
        });
      })
      .catch(() => {
        // Keep default Telegram platform when offline or loading
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handlePickPhoto = async () => {
    triggerHaptic();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const picked = result.assets[0];
      setSelectedMedia({
        uri: picked.uri,
        name: picked.name || 'photo.jpg'
      });
      setOutcomes([]);
    } catch (err: any) {
      Alert.alert('Photo Picker Error', err?.message || 'Could not select a photo from your device.');
    }
  };

  const togglePlatform = (platformId: string) => {
    triggerHaptic();
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((id) => id !== platformId) : [...prev, platformId]
    );
  };

  const handleSelectTemplate = (template: DirectPostTemplate) => {
    triggerHaptic();
    setSelectedTemplateId(template.id);
    setDescription(template.content);
  };

  const handleReset = () => {
    triggerHaptic();
    setSelectedMedia(null);
    setSelectedTemplateId(DIRECT_POST_DESCRIPTION_TEMPLATES[0].id);
    setDescription(DIRECT_POST_DESCRIPTION_TEMPLATES[0].content);
    setOutcomes([]);
  };

  const handlePublish = async () => {
    const trimmedDesc = description.trim();
    if (!selectedMedia && !trimmedDesc) {
      Alert.alert('Content Required', 'Please upload a photo or write a description before posting.');
      return;
    }
    if (selectedPlatforms.length === 0) {
      Alert.alert('Select a Platform', 'Please choose at least one social media platform.');
      return;
    }

    triggerHaptic();
    setIsPublishing(true);

    const initialOutcomes: PublishOutcomeItem[] = selectedPlatforms.map((id) => {
      const meta = platforms.find((p) => p.id === id);
      return {
        platform: id,
        platformName: meta?.name || id,
        status: 'PENDING'
      };
    });
    setOutcomes(initialOutcomes);

    try {
      let mediaToken: string | undefined;
      let effectiveMediaType: DirectMediaType = 'text';

      // 1. Upload photo only if one was selected
      if (selectedMedia) {
        setPublishPhase('uploading');
        const uploaded = await mobileApi.uploadDirectPostMedia(
          selectedMedia.uri,
          'photo',
          selectedMedia.name
        );
        mediaToken = uploaded.mediaToken;
        effectiveMediaType = 'photo';
      }

      setPublishPhase('publishing');

      // 2. Publish sequentially per platform so each outcome updates live
      for (const platformId of selectedPlatforms) {
        setOutcomes((prev) =>
          prev.map((item) =>
            item.platform === platformId ? { ...item, status: 'IN_PROGRESS' } : item
          )
        );

        try {
          const res = await mobileApi.publishDirectPost({
            mediaToken,
            mediaType: effectiveMediaType,
            description: trimmedDesc,
            platforms: [platformId]
          });

          const matched = res.results?.find((r) => r.platform === platformId);
          if (matched) {
            setOutcomes((prev) =>
              prev.map((item) =>
                item.platform === platformId
                  ? {
                      ...item,
                      status: matched.status,
                      remotePostId: matched.remotePostId,
                      remoteUrl: matched.remoteUrl,
                      error: matched.error
                    }
                  : item
              )
            );
          } else {
            setOutcomes((prev) =>
              prev.map((item) =>
                item.platform === platformId
                  ? { ...item, status: 'FAILED', error: 'No response from server' }
                  : item
              )
            );
          }
        } catch (stepErr: any) {
          setOutcomes((prev) =>
            prev.map((item) =>
              item.platform === platformId
                ? { ...item, status: 'FAILED', error: stepErr?.message || 'Publishing failed' }
                : item
            )
          );
        }
      }
    } catch (uploadErr: any) {
      Alert.alert('Upload Failed', uploadErr?.message || 'Could not upload photo to server.');
      setOutcomes([]);
    } finally {
      setIsPublishing(false);
      setPublishPhase('idle');
    }
  };

  const canPost = Boolean(
    (selectedMedia || description.trim().length > 0) && selectedPlatforms.length > 0 && !isPublishing
  );
  const hasCompletedSuccess = outcomes.length > 0 && outcomes.some((o) => o.status === 'SUCCESS');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Social Post</Text>
          <Text style={styles.subtitle}>
            Upload a photo, write your caption, and publish directly to your channels
          </Text>
        </View>

        {/* Media Type Selector (Photo active, Video ready for future release) */}
        <View style={styles.mediaTypeRow}>
          <View style={[styles.mediaTypeTab, styles.mediaTypeTabActive]}>
            <Ionicons name="image" size={16} color="#020617" style={{ marginRight: 6 }} />
            <Text style={styles.mediaTypeTabTextActive}>Photo</Text>
          </View>
          <TouchableOpacity
            style={styles.mediaTypeTab}
            activeOpacity={0.75}
            onPress={() =>
              Alert.alert('Coming Soon', 'Direct video posting will be supported in a future update.')
            }
          >
            <Ionicons name="videocam-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
            <Text style={styles.mediaTypeTabText}>Video</Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Soon</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 1. Photo Upload & Preview Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🖼️ Photo (Optional)</Text>
          {selectedMedia ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: selectedMedia.uri }} style={styles.photoPreview} resizeMode="cover" />
              <View style={styles.previewFooter}>
                <Text style={styles.previewFilename} numberOfLines={1}>
                  {selectedMedia.name}
                </Text>
                <View style={styles.previewFooterActions}>
                  <TouchableOpacity
                    style={styles.changePhotoBtn}
                    onPress={handlePickPhoto}
                    disabled={isPublishing}
                  >
                    <Ionicons name="swap-horizontal" size={14} color={THEME.colors.primary} />
                    <Text style={styles.changePhotoBtnText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic();
                      setSelectedMedia(null);
                      setOutcomes([]);
                    }}
                    disabled={isPublishing}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={22} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadDropzone}
              onPress={handlePickPhoto}
              activeOpacity={0.8}
            >
              <View style={styles.uploadIconCircle}>
                <Ionicons name="cloud-upload-outline" size={28} color={THEME.colors.primary} />
              </View>
              <Text style={styles.uploadTitle}>Upload a Photo</Text>
              <Text style={styles.uploadHint}>JPG, PNG, or WEBP from your device</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Description / Caption */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📝 Description</Text>
            <Text style={styles.charCount}>
              {description.length} / {selectedMedia ? 1024 : 4096}
            </Text>
          </View>

          {/* Template Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.templateRow}
            contentContainerStyle={styles.templateRowContent}
          >
            {DIRECT_POST_DESCRIPTION_TEMPLATES.map((tpl) => {
              const isActive = selectedTemplateId === tpl.id;
              return (
                <TouchableOpacity
                  key={tpl.id}
                  style={[styles.templateChip, isActive && styles.templateChipActive]}
                  onPress={() => handleSelectTemplate(tpl)}
                  activeOpacity={0.75}
                  disabled={isPublishing}
                >
                  <Text style={[styles.templateChipText, isActive && styles.templateChipTextActive]}>
                    {tpl.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.descInput}
            multiline
            numberOfLines={5}
            value={description}
            onChangeText={setDescription}
            placeholder="Write your caption, match analysis, or channel announcement..."
            placeholderTextColor={THEME.colors.textMuted}
            editable={!isPublishing}
          />
        </View>

        {/* 3. Target Social Media Platforms (Extensible) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📡 Social Media Channels</Text>
          <View style={styles.platformList}>
            {platforms.map((platform) => {
              const isSelected = selectedPlatforms.includes(platform.id);
              return (
                <TouchableOpacity
                  key={platform.id}
                  style={[styles.platformRow, isSelected && styles.platformRowSelected]}
                  onPress={() => togglePlatform(platform.id)}
                  activeOpacity={0.8}
                  disabled={isPublishing}
                >
                  <View style={[styles.platformIconBox, { backgroundColor: platform.color }]}>
                    <Ionicons name={getPlatformIconName(platform.id)} size={18} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.platformName}>{platform.name}</Text>
                    <Text style={styles.platformSubtitle} numberOfLines={1}>
                      {platform.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#020617" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Live Publishing Outcomes */}
        {outcomes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Publishing Status</Text>
            <View style={styles.outcomeList}>
              {outcomes.map((item) => (
                <View key={item.platform} style={styles.outcomeRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.outcomeName}>{item.platformName}</Text>
                    {item.status === 'PENDING' && (
                      <Text style={styles.outcomePending}>Waiting in queue...</Text>
                    )}
                    {item.status === 'IN_PROGRESS' && (
                      <Text style={styles.outcomeInProgress}>Posting...</Text>
                    )}
                    {item.status === 'SUCCESS' && (
                      <Text style={styles.outcomeSuccess}>
                        ✅ Posted successfully {item.remotePostId ? `(#${item.remotePostId})` : ''}
                      </Text>
                    )}
                    {item.status === 'FAILED' && (
                      <Text style={styles.outcomeFailed}>❌ {item.error || 'Failed to post'}</Text>
                    )}
                  </View>
                  {item.status === 'IN_PROGRESS' && (
                    <ActivityIndicator size="small" color={THEME.colors.primary} />
                  )}
                  {item.status === 'SUCCESS' && item.remoteUrl && (
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={() => Linking.openURL(item.remoteUrl!)}
                    >
                      <Text style={styles.viewBtnText}>View ↗</Text>
                    </TouchableOpacity>
                  )}
                  {item.status === 'FAILED' && (
                    <Ionicons name="alert-circle" size={20} color="#ef4444" />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Primary Action Button */}
        <TouchableOpacity
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          onPress={handlePublish}
          disabled={!canPost}
          activeOpacity={0.85}
        >
          {isPublishing ? (
            <View style={styles.postBtnLoadingRow}>
              <ActivityIndicator color="#020617" size="small" />
              <Text style={styles.postBtnText}>
                {publishPhase === 'uploading' ? 'Uploading photo...' : 'Posting...'}
              </Text>
            </View>
          ) : (
            <View style={styles.postBtnLoadingRow}>
              <Ionicons name="paper-plane" size={18} color="#020617" />
              <Text style={styles.postBtnText}>Post Now</Text>
            </View>
          )}
        </TouchableOpacity>

        {hasCompletedSuccess && !isPublishing && (
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
            <Text style={styles.resetBtnText}>Start New Post</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  scroll: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  header: {
    marginBottom: 16
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4
  },
  mediaTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  mediaTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  mediaTypeTabActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  mediaTypeTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b'
  },
  mediaTypeTabTextActive: {
    fontSize: 14,
    fontWeight: '800',
    color: '#020617'
  },
  soonBadge: {
    marginLeft: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  soonBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8'
  },
  section: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    marginBottom: 8
  },
  charCount: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600'
  },
  uploadDropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(56, 189, 248, 0.45)',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 30,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc'
  },
  uploadHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155'
  },
  photoPreview: {
    width: '100%',
    height: 240,
    backgroundColor: '#020617'
  },
  previewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  previewFilename: {
    flex: 1,
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
    marginRight: 10
  },
  previewFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  changePhotoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary
  },
  templateRow: {
    marginBottom: 10
  },
  templateRowContent: {
    gap: 8
  },
  templateChip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  templateChipActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.16)',
    borderColor: THEME.colors.primary
  },
  templateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8'
  },
  templateChipTextActive: {
    color: THEME.colors.primary
  },
  descInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 110,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  platformList: {
    gap: 8
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  platformRowSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(14, 165, 233, 0.12)'
  },
  platformIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  platformName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary
  },
  platformSubtitle: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  checkboxSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  outcomeList: {
    gap: 10
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12
  },
  outcomeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc'
  },
  outcomePending: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  outcomeInProgress: {
    fontSize: 12,
    color: THEME.colors.primary,
    marginTop: 2
  },
  outcomeSuccess: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 2
  },
  outcomeFailed: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2
  },
  viewBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981'
  },
  postBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  postBtnDisabled: {
    opacity: 0.45
  },
  postBtnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  postBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#020617'
  },
  resetBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center'
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1'
  }
});
