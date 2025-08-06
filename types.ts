



export enum AppState {
  SPLASH,
  ONBOARDING,
  AUTH,
  VERIFICATION,
  PROFILE_SETUP,
  MAIN_APP,
}

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  isVerified: boolean;
  profilePic?: string;
  phoneNumber?: string;
  locationSharingEnabled: boolean;
  circleId: string;
}

export interface LocationPoint {
    lat: number;
    lng: number;
    timestamp: Date;
}

export interface FamilyMember {
  id:string;
  name: string;
  lat: number;
  lng: number;
  isCurrentUser: boolean;
  profilePic: string;
  phoneNumber: string;
  history?: LocationPoint[];
  locationSharingEnabled: boolean;
  batteryLevel: number;
  lowBatteryNotified?: boolean;
  heading?: number;
}

export interface ChatBackground {
  type: 'color' | 'image' | 'pattern';
  value: string; // Hex code, data URL, or pattern URL
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: Date;
    attachment?: {
        type: 'image' | 'document' | 'audio';
        url: string;
        fileName: string;
    };
    isDeleted?: boolean; // Deleted for everyone
    deletedFor?: string[]; // Array of user IDs who deleted it for themselves
}

export interface SafeZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // in meters
  color: string;
}

export interface AppNotification {
  id: string;
  type: 'geofence-enter' | 'geofence-leave' | 'low-battery' | 'new-message' | 'new-member' | 'error' | 'arrival' | 'find-device';
  title: string;
  message: string;
  onClick?: () => void;
}

export interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface RouteStep {
  maneuver: {
    type: string;
    modifier?: string;
    instruction: string;
    location: [number, number]; // [lng, lat]
  };
  distance: number;
  duration: number;
  voiceInstructions?: {
    distanceAlongGeometry: number;
    announcement: string;
    ssmlAnnouncement: {
      ssml: string;
    };
  }[];
}

export interface RouteInfo {
    path: [number, number][];
    distance: number; // in meters
    duration: number; // in seconds
    steps: RouteStep[];
}

export interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export type NavigationTarget = FamilyMember | Poi;

// Props for MapView
export interface MapViewProps {
  familyMembers: FamilyMember[];
  safeZones: SafeZone[];
  navigationTarget: NavigationTarget | null;
  routeInfo: RouteInfo | null;
  currentStepIndex: number;
  ringingDeviceId: string | null;
  onStartChat: (member: FamilyMember) => void;
  onSaveSafeZone: (zoneData: { name: string; radius: number }) => void;
  onZoneClick: (zone: SafeZone) => void;
  onShowHistory: (member: FamilyMember) => void;
  onStartNavigation: (target: NavigationTarget) => void;
  onCancelNavigation: () => void;
  onFindMyDevice: (memberId: string) => void;
  onAddNotification: (notification: Omit<AppNotification, 'id'>) => void;
}

// Props for ProfileSetup
export interface ProfileSetupProps {
  onComplete: (fullName: string, profilePic?: string | null) => void;
  onAddNotification: (notification: Omit<AppNotification, 'id'>) => void;
}


// Props for ChatView
export interface ChatViewProps {
    currentUser: User;
    chatTarget: 'group' | FamilyMember | null;
    messages: ChatMessage[];
    familyMembers: FamilyMember[];
    joinedCircle: {owner: User, members: User[]} | null;
    onSendMessage: (text: string, attachment?: any) => void;
    onNavigateToSettings: () => void;
    onAddNotification: (notification: Omit<AppNotification, 'id'>) => void;
    onStartVideoCall: (target: 'group' | FamilyMember) => void;
    onOpenMessageActions: (message: ChatMessage, event: React.MouseEvent) => void;
    chatBackgrounds: { [key: string]: ChatBackground };
    onSetChatBackground: (background: ChatBackground | null) => void;
}


// Props for SettingsView
export interface SettingsViewProps {
  user: User;
  myCircleMembers: User[];
  joinedCircle: {owner: User, members: User[]} | null;
  safeZones: SafeZone[];
  isLoading: boolean;
  notificationPermission: NotificationPermission;
  onLogout: () => void;
  onUpdateProfile: (updatedData: Partial<User>) => void;
  onToggleLocationSharing: (isEnabled: boolean) => void;
  onJoinCircle: (circleId: string) => void;
  onRequestConfirmation: (title: string, message: string, onConfirm: () => void) => void;
  onLeaveCircle: () => void;
  onRemoveMember: (memberId: string) => void;
  onAddNotification: (notification: Omit<AppNotification, 'id'>) => void;
  onEditSafeZone: (zone: SafeZone) => void;
  onRequestNotificationPermission: () => void;
}

export interface MarkerPopupProps {
  member: FamilyMember;
  onClose: () => void;
  onStartChat: (member: FamilyMember) => void;
  onShowHistory: (member: FamilyMember) => void;
  onStartNavigation: (member: FamilyMember) => void;
  onFindMyDevice: (memberId: string) => void;
  onAddNotification: (notification: Omit<AppNotification, 'id'>) => void;
}


export interface NotificationPermissionBannerProps {
  onEnable: () => void;
  onDismiss: () => void;
}