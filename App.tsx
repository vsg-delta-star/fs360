
import * as React from 'react';
import { AppState, User, FamilyMember, SafeZone, AppNotification, ChatMessage, LocationPoint, ConfirmationState, RouteInfo, NavigationTarget, Poi, RouteStep, ChatBackground } from './types';
import SplashScreen from './components/SplashScreen';
import Onboarding from './components/Onboarding';
import Auth from './components/Auth';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import ProfileSetup from './components/ProfileSetup';
import MapView from './components/MapView';
import BottomNavBar from './components/BottomNavBar';
import SettingsView from './components/SettingsView';
import ChatView from './components/ChatView';
import LocationHistoryView from './components/LocationHistoryView';
import NotificationContainer from './components/NotificationContainer';
import ConfirmationModal from './components/ConfirmationModal';
import MapPlaceholder from './components/MapPlaceholder';
import VideoCallView from './components/VideoCallView';
import AnimatedMapBackground from './components/AnimatedMapBackground';
import { MAPBOX_API_KEY } from './components/config';
import EditSafeZoneModal from './components/EditSafeZoneModal';
import { speak, cancelSpeech } from './utils/speech';
import MessageActionMenu from './components/MessageActionMenu';
import NotificationPermissionBanner from './components/NotificationPermissionBanner';
import { getDistance } from './utils/location';
import { generateAvatar } from './utils/avatar';


// --- UTILS for LocalStorage Persistence ---

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    try {
        return JSON.parse(stored, (k, v) => {
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(v)) {
                return new Date(v);
            }
            return v;
        });
    } catch (e) {
        console.error(`Error parsing localStorage key "${key}":`, e);
        return defaultValue;
    }
};

const saveToStorage = <T,>(key: string, value: T) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving to localStorage key "${key}":`, e);
    }
};

// --- END UTILS ---

const App: React.FC = () => {
  const [appState, setAppState] = React.useState<AppState>(AppState.SPLASH);
  const [currentUser, setCurrentUser] = React.useState<User | null>(() => getFromStorage('currentUser', null));
  const [mainView, setMainView] = React.useState<'map' | 'chat' | 'settings'>('map');
  const [familyMembers, setFamilyMembers] = React.useState<FamilyMember[]>([]);
  const [activeChat, setActiveChat] = React.useState<'group' | FamilyMember | null>('group');
  const [historyViewMember, setHistoryViewMember] = React.useState<FamilyMember | null>(null);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const prevFamilyMembersRef = React.useRef<FamilyMember[]>([]);
  
  // "Circle of Circles" state
  const [myCircleMembers, setMyCircleMembers] = React.useState<User[]>([]);
  const [joinedCircle, setJoinedCircle] = React.useState<{owner: User, members: User[]} | null>(null);
  
  // UX State
  const [isLoading, setIsLoading] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [confirmationState, setConfirmationState] = React.useState<ConfirmationState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Video Call State
  const [isCalling, setIsCalling] = React.useState(false);
  const [callTarget, setCallTarget] = React.useState<FamilyMember | 'group' | null>(null);

  // Navigation State
  const [navigationTarget, setNavigationTarget] = React.useState<NavigationTarget | null>(null);
  const [routeInfo, setRouteInfo] = React.useState<RouteInfo | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [spokenInstructions, setSpokenInstructions] = React.useState<Set<string>>(new Set());

  // Safe Zone Edit State
  const [editingZone, setEditingZone] = React.useState<SafeZone | null>(null);

  // Chat Message Action State
  const [messageActionMenu, setMessageActionMenu] = React.useState<{
    isOpen: boolean;
    message: ChatMessage | null;
    position: { x: number, y: number };
  }>({ isOpen: false, message: null, position: { x: 0, y: 0 } });

  // Notification Permission State
  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>(Notification.permission);
  const [isPermissionBannerDismissed, setIsPermissionBannerDismissed] = React.useState(false);
  
  // Find My Device state
  const [ringingDeviceId, setRingingDeviceId] = React.useState<string | null>(null);

  // --- PERSISTENT STATE (from localStorage) ---
  
  const [users, setUsers] = React.useState<User[]>(() => {
    const stored = getFromStorage<User[]>('users', []);
    if (stored.length > 0) return stored;
    // Seed data on first run
    const initialUsers: User[] = [
        { id: '1', email: 'you@google.com', fullName: 'Cesar Fallaria', isVerified: true, profilePic: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=200&auto=format&fit=crop', phoneNumber: '111-222-3333', locationSharingEnabled: true, circleId: 'T47-AHE-UIO' },
        { id: '2', email: 'jane@example.com', fullName: 'Jane Doe', isVerified: true, profilePic: 'https://picsum.photos/id/238/100/100', phoneNumber: '222-333-4444', locationSharingEnabled: true, circleId: 'B7Y-3E1-K8Q' },
        { id: '3', email: 'john@example.com', fullName: 'John Jr.', isVerified: true, profilePic: undefined, phoneNumber: '333-444-5555', locationSharingEnabled: true, circleId: 'C6Z-2D0-J7R' },
    ];
    saveToStorage('users', initialUsers);
    return initialUsers;
  });

  const [joinedCircles, setJoinedCircles] = React.useState<{[memberId: string]: string}>(() => {
      const stored = getFromStorage<{[memberId: string]: string}>('joinedCircles', {});
      if (Object.keys(stored).length > 0) return stored;
      const initialCircles = { '1': 'T47-AHE-UIO' };
      saveToStorage('joinedCircles', initialCircles);
      return initialCircles;
  });

  const [userSettings, setUserSettings] = React.useState<{[key: string]: { safeZones: SafeZone[] }}>(() => {
    const stored = getFromStorage<{[key: string]: { safeZones: SafeZone[] } }>('userSettings', {});
    if (Object.keys(stored).length > 0) return stored;
    const initialSettings = {
        '1': {
            safeZones: [
                { id: 'sz1', name: 'Home', lat: 34.0522, lng: -118.243, radius: 150, color: 'rgba(74, 222, 128, 0.3)'},
                { id: 'sz2', name: 'School', lat: 34.056, lng: -118.246, radius: 200, color: 'rgba(96, 165, 250, 0.3)'},
            ]
        }
    };
    saveToStorage('initialSettings', initialSettings);
    return initialSettings;
  });

  const [chatMessages, setChatMessages] = React.useState<{[key: string]: ChatMessage[]}>(() => {
    const stored = getFromStorage<{[key: string]: ChatMessage[]}>('chatMessages', {});
    if (Object.keys(stored).length > 0) return stored;
    const initialMessages: {[key: string]: ChatMessage[]} = {
        'group-T47-AHE-UIO': [
            { id: 'm1', senderId: '2', senderName: 'Jane Doe', text: 'Hey everyone, I just got to the library!', timestamp: new Date(Date.now() - 1000 * 60 * 5)},
            { id: 'm2', senderId: '1', senderName: 'You', text: 'Great! I see you on the map. I\'m heading home now.', timestamp: new Date(Date.now() - 1000 * 60 * 4)},
            { id: 'm3', senderId: '3', senderName: 'John Jr.', text: '', timestamp: new Date(Date.now() - 1000 * 60 * 3), attachment: { type: 'image', url: 'https://picsum.photos/seed/family/400/300', fileName: 'park_photo.jpg' }},
        ],
        'private-1-2': [
            { id: 'p1', senderId: '2', senderName: 'Jane Doe', text: 'Hey, can you pick up milk on your way home?', timestamp: new Date(Date.now() - 1000 * 60 * 10)},
            { id: 'p2', senderId: '1', senderName: 'You', text: 'Sure thing!', timestamp: new Date(Date.now() - 1000 * 60 * 9)},
        ],
        'private-1-3': [
            { id: 'p3', senderId: '3', senderName: 'John Jr.', text: 'I forgot my keys, can you let me in when you get here?', timestamp: new Date(Date.now() - 1000 * 60 * 5)},
        ]
    };
    saveToStorage('chatMessages', initialMessages);
    return initialMessages;
  });

  const [userLocations, setUserLocations] = React.useState<{[key: string]: { lat: number, lng: number, batteryLevel: number, history: LocationPoint[], heading?: number}}>(() => {
    const stored = getFromStorage<any>('userLocations', {});
     if (Object.keys(stored).length > 0) return stored;
    const initialLocations = {
        '1': { lat: 34.052235, lng: -118.243683, batteryLevel: 95, history: [], heading: 0 },
        '2': { lat: 34.058, lng: -118.248, batteryLevel: 78, history: [{ lat: 34.057, lng: -118.247, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3) }, { lat: 34.058, lng: -118.248, timestamp: new Date(Date.now() - 1000 * 60 * 15) }] },
        '3': { lat: 34.05, lng: -118.24, batteryLevel: 22, history: [{ lat: 34.051, lng: -118.241, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4) }, { lat: 34.05, lng: -118.24, timestamp: new Date(Date.now() - 1000 * 60 * 5) }] },
    };
    saveToStorage('userLocations', initialLocations);
    return initialLocations;
  });

  const [chatBackgrounds, setChatBackgrounds] = React.useState<{[key: string]: ChatBackground}>(() => getFromStorage('chatBackgrounds', {}));


  React.useEffect(() => { saveToStorage('currentUser', currentUser); }, [currentUser]);
  React.useEffect(() => { saveToStorage('users', users); }, [users]);
  React.useEffect(() => { saveToStorage('joinedCircles', joinedCircles); }, [joinedCircles]);
  React.useEffect(() => { saveToStorage('userSettings', userSettings); }, [userSettings]);
  React.useEffect(() => { saveToStorage('chatMessages', chatMessages); }, [chatMessages]);
  React.useEffect(() => { saveToStorage('userLocations', userLocations); }, [userLocations]);
  React.useEffect(() => { saveToStorage('chatBackgrounds', chatBackgrounds); }, [chatBackgrounds]);
  
  // --- END PERSISTENT STATE ---

  const getChatId = (target: 'group' | FamilyMember | null): string | null => {
    if (!currentUser) return null;
    if (target === 'group') {
        return joinedCircle ? `group-${joinedCircle.owner.circleId}` : null;
    }
    if (target && typeof target !== 'string') {
        const userIds = [currentUser.id, target.id].sort();
        return `private-${userIds[0]}-${userIds[1]}`;
    }
    return null;
  }

  const removeNotification = React.useCallback((id: string) => {
    setNotifications(current => current.filter(n => n.id !== id));
  }, []);

  const addNotification = React.useCallback((notification: Omit<AppNotification, 'id'>) => {
    const id = `notif_${Date.now()}`;
    const newNotif = { ...notification, id };
    setNotifications(current => [...current, newNotif]);
    setTimeout(() => removeNotification(id), 6000);

    // --- Native Browser Notification ---
    if (notificationPermission === 'granted') {
        // Suppress new message notifications if the user is already viewing the chat
        if (notification.type === 'new-message') {
            const incomingChatId = getChatId(activeChat); // Assuming the activeChat is the one receiving the message for this logic
            if (mainView === 'chat' && getChatId(activeChat) === incomingChatId) {
                return; // Don't show system notification for the active chat
            }
        }
        const notif = new Notification(newNotif.title, {
            body: newNotif.message,
            icon: '/favicon.ico', // Optional: Add an icon
            tag: id, // Helps prevent duplicate notifications
        });
        if(newNotif.onClick) {
            notif.onclick = () => {
                newNotif.onClick?.();
                window.focus(); // Bring the window to the front
            };
        }
    }
  }, [removeNotification, notificationPermission, mainView, activeChat]);

  const handleRequestNotificationPermission = () => {
      Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
          if (permission === 'granted') {
              addNotification({type: 'new-member', title: 'Notifications Enabled', message: 'You will now receive alerts.'});
          } else {
              addNotification({type: 'error', title: 'Notifications Disabled', message: 'You can enable notifications in your browser settings.'});
          }
      });
  };

  // Generates a new unique Circle ID
  const generateCircleId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const parts = [3, 3, 3];
    return parts.map(partLength => 
      Array.from({ length: partLength }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    ).join('-');
  };

  const updateCircles = React.useCallback((userId: string) => {
    const userForCircleId = users.find(u => u.id === userId);
    if (!userForCircleId) return;

    const myMembers = Object.entries(joinedCircles)
        .filter(([, ownerCircleId]) => userForCircleId.circleId === ownerCircleId)
        .map(([memberId]) => users.find(u => u.id === memberId)!)
        .filter(Boolean);
    setMyCircleMembers(myMembers);

    const joinedCircleId = joinedCircles[userId];
    if (joinedCircleId) {
        const owner = users.find(u => u.circleId === joinedCircleId);
        if (owner) {
            const membersOfJoinedCircle = users.filter(u => joinedCircles[u.id] === owner.circleId || u.id === owner.id);
            setJoinedCircle({ owner, members: membersOfJoinedCircle });
        } else {
            setJoinedCircle(null);
        }
    } else {
        setJoinedCircle(null);
    }
  }, [users, joinedCircles]);

  const familyMembersFromUsers = React.useCallback((usersToMap: User[], currentUserId: string): FamilyMember[] => {
      return usersToMap.map(user => {
          const locationData = userLocations[user.id];
          if (!locationData) {
              return {
                  id: user.id,
                  name: user.id === currentUserId ? user.fullName || 'You' : user.fullName || `User ${user.id}`,
                  isCurrentUser: user.id === currentUserId,
                  profilePic: generateAvatar(user),
                  phoneNumber: user.phoneNumber || 'N/A',
                  locationSharingEnabled: user.locationSharingEnabled,
                  lat: 34.0522, // Default LA
                  lng: -118.2437,
                  batteryLevel: 100,
                  history: [],
                  heading: undefined,
              };
          }
          return {
              id: user.id,
              name: user.id === currentUserId ? user.fullName || 'You' : user.fullName || `User ${user.id}`,
              isCurrentUser: user.id === currentUserId,
              profilePic: generateAvatar(user),
              phoneNumber: user.phoneNumber || 'N/A',
              locationSharingEnabled: user.locationSharingEnabled,
              lat: locationData.lat,
              lng: locationData.lng,
              batteryLevel: locationData.batteryLevel,
              history: locationData.history || [],
              heading: locationData.heading,
          };
      });
  }, [userLocations]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
        if (currentUser) {
            updateCircles(currentUser.id);
            setAppState(AppState.MAIN_APP);
        } else {
            setAppState(localStorage.getItem('onboardingCompleted') ? AppState.AUTH : AppState.ONBOARDING);
        }
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // Only run on initial mount

  React.useEffect(() => {
    if (currentUser) {
        updateCircles(currentUser.id);
    }
  }, [currentUser, users, joinedCircles, updateCircles]);

  React.useEffect(() => {
    if (currentUser && joinedCircle) {
        setFamilyMembers(familyMembersFromUsers(joinedCircle.members, currentUser.id));
    } else if (currentUser) {
        setFamilyMembers(familyMembersFromUsers([currentUser], currentUser.id));
    } else {
        setFamilyMembers([]);
    }
  }, [currentUser, joinedCircle, familyMembersFromUsers]);

  React.useEffect(() => {
    if (appState === AppState.MAIN_APP && currentUser && familyMembers.length > 0 && !isMapReady) {
      const timer = setTimeout(() => { setIsMapReady(true); }, 300);
      return () => clearTimeout(timer);
    } else if (appState !== AppState.MAIN_APP) {
      setIsMapReady(false);
    }
  }, [appState, currentUser, familyMembers, isMapReady]);
  
  const handleUpdateProfile = (updatedData: Partial<User>) => {
    if (!currentUser) return;
    setIsLoading(true);
    setTimeout(() => {
        const updatedUser = { ...currentUser, ...updatedData };
        setCurrentUser(updatedUser);
        setUsers(currentUsers => currentUsers.map(u => u.id === currentUser.id ? updatedUser : u));
        setIsLoading(false);
        addNotification({type: 'new-member', title: 'Profile Updated', message: 'Your changes have been saved.'});
    }, 1500);
  };
  
  const handleLocationSharingToggle = (isEnabled: boolean) => {
    if (!currentUser) return;
    handleUpdateProfile({ locationSharingEnabled: isEnabled });
  };
  
  const disableLocationSharingSilently = React.useCallback(() => {
      if (!currentUser) return;
      const updatedUser = { ...currentUser, locationSharingEnabled: false };
      setCurrentUser(updatedUser);
      setUsers(currentUsers => currentUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
  }, [currentUser]);

  const recordUserLocation = React.useCallback((userId: string, lat: number, lng: number) => {
    setUserLocations(locs => {
        const userLoc = locs[userId];
        if (!userLoc) return locs;

        const lastPoint = userLoc.history[userLoc.history.length - 1];
        
        let shouldRecord = false;
        if (!lastPoint) {
            shouldRecord = true;
        } else {
            const distance = getDistance(lastPoint.lat, lastPoint.lng, lat, lng);
            const timeSinceLastPoint = new Date().getTime() - new Date(lastPoint.timestamp).getTime();

            // Record if:
            // 1. Moved a significant distance (e.g., driving > 100m)
            // 2. Moved a smaller distance but after a long time (e.g., walking for 5+ mins)
            if (distance > 100 || (distance > 25 && timeSinceLastPoint > 5 * 60 * 1000)) {
                shouldRecord = true;
            }
        }
        
        if (shouldRecord) {
            const newHistoryPoint: LocationPoint = { lat, lng, timestamp: new Date() };
            const newHistory = lastPoint ? [...userLoc.history, newHistoryPoint] : [newHistoryPoint];
            return {
                ...locs,
                [userId]: { ...userLoc, lat, lng, history: newHistory }
            };
        }
        
        // If not recording to history, just update the live location
        return { ...locs, [userId]: { ...userLoc, lat, lng } };
    });
  }, []);

  React.useEffect(() => {
    if (appState === AppState.MAIN_APP && currentUser?.locationSharingEnabled) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          recordUserLocation(currentUser.id, position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          let title = 'Location Error'; let message = 'Could not retrieve your location.';
          if (error.code === error.PERMISSION_DENIED) {
            title = 'Location Access Denied'; message = 'Live location tracking is off. Please enable it in your browser/device settings.';
            disableLocationSharingSilently();
          }
          addNotification({ type: 'error', title, message });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
      );
      
      const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
        if (currentUser && event.alpha !== null) {
          const newHeading = ((event as any).webkitCompassHeading || event.alpha);
          setUserLocations(locs => {
            const userLoc = locs[currentUser.id];
            if (!userLoc) return locs;
            return { ...locs, [currentUser.id]: { ...userLoc, heading: newHeading }};
          });
        }
      };

      if ('DeviceOrientationEvent' in window) {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }

      return () => {
        navigator.geolocation.clearWatch(watchId);
        if ('DeviceOrientationEvent' in window) {
            window.removeEventListener('deviceorientation', handleDeviceOrientation);
        }
      };
    }
  }, [appState, currentUser?.id, currentUser?.locationSharingEnabled, addNotification, disableLocationSharingSilently, recordUserLocation]);
  
  React.useEffect(() => {
    if (appState !== AppState.MAIN_APP || familyMembers.length <= 1) return;
    const interval = setInterval(() => {
        familyMembers.forEach(member => {
            if (!member.isCurrentUser && member.locationSharingEnabled) {
                const latChange = (Math.random() - 0.5) * 0.0015;
                const lngChange = (Math.random() - 0.5) * 0.0015;
                setUserLocations(locs => {
                    const currentLoc = locs[member.id];
                    if (!currentLoc) return locs;
                    
                    const newLat = currentLoc.lat + latChange;
                    const newLng = currentLoc.lng + lngChange;

                    const lastPoint = currentLoc.history[currentLoc.history.length - 1];
                    let newHistory = currentLoc.history;
                    let shouldRecord = false;

                    if (!lastPoint) {
                        shouldRecord = true;
                    } else {
                        const distance = getDistance(lastPoint.lat, lastPoint.lng, newLat, newLng);
                        const timeSinceLastPoint = new Date().getTime() - new Date(lastPoint.timestamp).getTime();

                        if (distance > 100 || (distance > 25 && timeSinceLastPoint > 5 * 60 * 1000)) {
                           shouldRecord = true;
                        }
                    }

                    if (shouldRecord) {
                        const newPoint = { lat: newLat, lng: newLng, timestamp: new Date() };
                        newHistory = lastPoint ? [...currentLoc.history, newPoint] : [newPoint];
                    }

                    return {
                        ...locs,
                        [member.id]: {
                            ...currentLoc,
                            lat: newLat,
                            lng: newLng,
                            batteryLevel: Math.max(0, currentLoc.batteryLevel - (Math.random() > 0.7 ? 1 : 0)),
                            history: newHistory,
                        },
                    };
                });
            }
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [appState, familyMembers]);

  React.useEffect(() => {
    const prevMembers = prevFamilyMembersRef.current;
    if (prevMembers.length === 0 || appState !== AppState.MAIN_APP || !currentUser) return;
    
    const userSafeZones = userSettings[currentUser.id]?.safeZones || [];

    familyMembers.forEach(member => {
        const prevMember = prevMembers.find(m => m.id === member.id);
        if (!member.isCurrentUser && prevMember) {
            userSafeZones.forEach(zone => {
                const prevDist = getDistance(prevMember.lat, prevMember.lng, zone.lat, zone.lng);
                const newDist = getDistance(member.lat, member.lng, zone.lat, zone.lng);
                if (prevDist > zone.radius && newDist <= zone.radius) addNotification({ type: 'geofence-enter', title: `${member.name} Entered Zone`, message: `${member.name} has entered ${zone.name}.` });
                else if (prevDist <= zone.radius && newDist > zone.radius) addNotification({ type: 'geofence-leave', title: `${member.name} Left Zone`, message: `${member.name} has left ${zone.name}.` });
            });
            if (member.batteryLevel <= 20 && prevMember.batteryLevel > 20) {
                addNotification({ type: 'low-battery', title: 'Low Battery', message: `${member.name}'s phone battery is at ${member.batteryLevel}%.` });
            }
        }
    });
    prevFamilyMembersRef.current = familyMembers;
  }, [familyMembers, userSettings, addNotification, appState, currentUser]);

  const handleLoginSuccess = React.useCallback((loginAttempt: Partial<User>) => {
    let userInDb = users.find(u => u.email === loginAttempt.email);
    
    // Simulate fetching full profile for social login
    if (loginAttempt.email === 'you@google.com' || loginAttempt.email === 'you@facebook.com') {
        const socialUser = users.find(u => u.email === 'you@google.com'); // Use google user as template
        if(socialUser) {
            loginAttempt.fullName = socialUser.fullName;
            loginAttempt.profilePic = socialUser.profilePic;
            loginAttempt.isVerified = true;
        }
    }

    if (!userInDb) {
        userInDb = {
            id: `user_${Date.now()}`,
            email: loginAttempt.email!,
            fullName: loginAttempt.fullName || null,
            isVerified: loginAttempt.isVerified || false,
            profilePic: loginAttempt.profilePic || undefined,
            phoneNumber: loginAttempt.phoneNumber || undefined,
            locationSharingEnabled: true,
            circleId: generateCircleId(),
        };
        setUsers(current => [...current, userInDb!]);
        setUserLocations(locs => ({ ...locs, [userInDb!.id]: { lat: 34.0522, lng: -118.2437, batteryLevel: 100, history: [] }}));
    } else if (loginAttempt.fullName && !userInDb.fullName) {
        // If an existing user logs in with social and they were missing details, update them
        userInDb = {...userInDb, fullName: loginAttempt.fullName, profilePic: loginAttempt.profilePic, isVerified: true };
        setUsers(current => current.map(u => u.id === userInDb!.id ? userInDb! : u));
    }
    
    setCurrentUser(userInDb);
    
    if (!userInDb.isVerified) setAppState(AppState.VERIFICATION);
    else if (!userInDb.fullName) setAppState(AppState.PROFILE_SETUP);
    else setAppState(AppState.MAIN_APP);
  }, [users]);
  
  const handleJoinCircle = (circleIdToJoin: string) => {
    setIsLoading(true);
    setTimeout(() => {
        if (!currentUser) { setIsLoading(false); return; }
        if (circleIdToJoin === currentUser.circleId) {
            addNotification({ type: 'error', title: 'Cannot Join', message: "You can't join your own circle." });
            setIsLoading(false); return;
        }
        const owner = users.find(u => u.circleId === circleIdToJoin);
        if (owner) {
             if (joinedCircles[currentUser.id] === circleIdToJoin) {
                addNotification({ type: 'error', title: 'Already Member', message: `You are already a member of ${owner.fullName}'s circle.` });
                setIsLoading(false); return;
            }
            setJoinedCircles(current => ({...current, [currentUser.id]: circleIdToJoin}));
            addNotification({ type: 'new-member', title: 'Welcome!', message: `You've successfully joined ${owner.fullName}'s circle.` });
        } else {
            addNotification({ type: 'error', title: 'Invalid Circle ID', message: 'The Circle ID you entered does not exist.' });
        }
        setIsLoading(false);
    }, 1500);
  };
  
  const handleConfirmAction = () => {
    setIsLoading(true);
    setTimeout(() => {
        confirmationState.onConfirm();
        setConfirmationState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
        setIsLoading(false);
    }, 1500);
  };

  const handleRequestConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmationState({ isOpen: true, title, message, onConfirm });
  };

  const handleLeaveCircle = () => {
      if (currentUser && joinedCircles[currentUser.id]) {
          const ownerName = joinedCircle?.owner?.fullName;
          setJoinedCircles(current => {
              const newCircles = {...current};
              delete newCircles[currentUser.id];
              return newCircles;
          });
          setJoinedCircle(null);
          addNotification({type: 'geofence-leave', title: 'Circle Left', message: ownerName ? `You have left ${ownerName}'s circle.` : "You have left the circle."});
      }
  };

  const handleRemoveMember = (memberId: string) => {
    const memberToRemove = users.find(u => u.id === memberId);
    if (currentUser && memberToRemove && joinedCircles[memberId] === currentUser.circleId) {
        setJoinedCircles(current => {
              const newCircles = {...current};
              delete newCircles[memberId];
              return newCircles;
          });
        addNotification({type: 'error', title: 'Member Removed', message: `${memberToRemove.fullName} has been removed from your circle.`});
    }
  };
  
  const handleVerificationResend = () => {
    console.log("Resending verification email...");
    setTimeout(() => {
        if(currentUser) {
            handleUpdateProfile({ isVerified: true });
            if (!currentUser.fullName) setAppState(AppState.PROFILE_SETUP);
            else setAppState(AppState.MAIN_APP);
        }
    }, 2000);
  };

  const handleProfileSetupComplete = (fullName: string, profilePic?: string | null) => {
    const updateData: Partial<User> = { fullName };
    if (profilePic) {
      updateData.profilePic = profilePic;
    }
    handleUpdateProfile(updateData);
    setAppState(AppState.MAIN_APP);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAppState(AppState.AUTH);
    setHistoryViewMember(null);
    setFamilyMembers([]);
    setJoinedCircle(null);
    setMyCircleMembers([]);
    setMainView('map');
  };

  const handleSendMessage = async (text: string, attachment?: any) => {
    if (!currentUser) return;
    const chatId = getChatId(activeChat);
    if (!chatId) return;

    const msg: ChatMessage = {
        id: `m${Date.now()}`, senderId: currentUser.id, senderName: currentUser.fullName || 'You',
        text: text, timestamp: new Date(), attachment,
    };
    setChatMessages(prev => ({...prev, [chatId]: [...(prev[chatId] || []), msg]}));

    // --- ENHANCED REPLY SIMULATION ---
    const replyingMember = activeChat === 'group' 
        ? familyMembers.filter(m => !m.isCurrentUser)[Math.floor(Math.random() * (familyMembers.length - 1))]
        : (activeChat as FamilyMember);

    if (replyingMember && 'id' in replyingMember && replyingMember.id !== currentUser.id) {
        setTimeout(async () => {
            const replyText = ['Got it!', 'Okay.', 'Thanks!', 'See you soon.', 'lol', 'I\'m on my way.', 'Running a bit late.'][Math.floor(Math.random() * 7)];
            const replyMsg: ChatMessage = { id: `m${Date.now()}`, senderId: replyingMember.id, senderName: replyingMember.name, text: replyText, timestamp: new Date() };
            
            const replyChatId = getChatId(activeChat);
            if (replyChatId) {
                setChatMessages(prev => ({...prev, [replyChatId]: [...(prev[replyChatId] || []), replyMsg]}));
                addNotification({ type: 'new-message', title: `New Message from ${replyingMember.name}`, message: replyText, onClick: () => { setActiveChat(activeChat); setMainView('chat'); } });
            }
        }, 1500 + Math.random() * 1500);
    }
  };

    const handleOpenMessageActions = (message: ChatMessage, event: React.MouseEvent) => {
        event.preventDefault();
        setMessageActionMenu({
            isOpen: true,
            message,
            position: { x: event.clientX, y: event.clientY },
        });
    };

    const handleCloseMessageActions = () => {
        setMessageActionMenu({ isOpen: false, message: null, position: { x: 0, y: 0 } });
    };

    const handleDeleteMessageForMe = () => {
        if (!messageActionMenu.message || !currentUser) return;
        const chatId = getChatId(activeChat);
        if (!chatId) return;

        setChatMessages(prev => {
            const updatedMessages = (prev[chatId] || []).map(msg => {
                if (msg.id === messageActionMenu.message!.id) {
                    return {
                        ...msg,
                        deletedFor: [...(msg.deletedFor || []), currentUser.id],
                    };
                }
                return msg;
            });
            return { ...prev, [chatId]: updatedMessages };
        });
        handleCloseMessageActions();
    };

    const handleDeleteMessageForEveryone = () => {
        if (!messageActionMenu.message || !currentUser) return;
        const chatId = getChatId(activeChat);
        if (!chatId) return;
        
        const message = messageActionMenu.message;
        const isOwner = message.senderId === currentUser.id;
        const isRecent = (new Date().getTime() - new Date(message.timestamp).getTime()) < 5 * 60 * 1000;

        if (isOwner && isRecent) {
            setChatMessages(prev => {
                const updatedMessages = (prev[chatId] || []).map(msg => {
                    if (msg.id === message.id) {
                        return { ...msg, text: '', attachment: undefined, isDeleted: true };
                    }
                    return msg;
                });
                return { ...prev, [chatId]: updatedMessages };
            });
        }
        handleCloseMessageActions();
    };

  
  const handleOnboardingComplete = () => { localStorage.setItem('onboardingCompleted', 'true'); setAppState(AppState.AUTH); };
  const handleStartPrivateChat = (member: FamilyMember) => { setActiveChat(member); setMainView('chat'); };
  const handleShowHistory = (member: FamilyMember) => { setHistoryViewMember(member); };
  const handleCloseHistory = () => { setHistoryViewMember(null); };
  const handleNavChange = (view: 'map' | 'chat' | 'settings') => {
    if (view === 'chat' && !joinedCircle) {
        setMainView('settings');
        addNotification({type: 'error', title: 'Join a Circle', message: "You must join a circle to use the group chat."});
    } else {
        if (view === 'chat') { setActiveChat('group'); }
        setMainView(view);
    }
  };

  const handleSaveSafeZone = (zoneData: { name: string; radius: number }) => {
    if (!currentUser) return;
    const currentUserLocation = familyMembers.find(m => m.isCurrentUser);
    if (!currentUserLocation) return;
    const newZone: SafeZone = { id: `sz${Date.now()}`, name: zoneData.name, lat: currentUserLocation.lat, lng: currentUserLocation.lng, radius: zoneData.radius, color: `rgba(${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, 0.3)` };
    setUserSettings(current => {
        const currentUserSettings = current[currentUser.id] || { safeZones: [] };
        return { ...current, [currentUser.id]: { ...currentUserSettings, safeZones: [...currentUserSettings.safeZones, newZone] } };
    });
    addNotification({ type: 'new-member', title: 'Safe Zone Added', message: `The "${zoneData.name}" zone has been created at your location.` });
  };
  
  const handleUpdateSafeZone = (updatedZone: SafeZone) => {
    if (!currentUser) return;
    setUserSettings(current => {
        const currentUserSettings = current[currentUser.id] || { safeZones: [] };
        const updatedSafeZones = currentUserSettings.safeZones.map(z => z.id === updatedZone.id ? updatedZone : z);
        return { ...current, [currentUser.id]: { ...currentUserSettings, safeZones: updatedSafeZones } };
    });
    addNotification({type: 'new-member', title: 'Safe Zone Updated', message: `Your changes to "${updatedZone.name}" have been saved.`});
    setEditingZone(null);
  };

  const handleDeleteSafeZone = (zoneId: string) => {
    if (!currentUser) return;
    const zoneToDelete = userSettings[currentUser.id]?.safeZones.find(z => z.id === zoneId);
    if (!zoneToDelete) return;

    handleRequestConfirmation(
      'Delete Safe Zone?',
      `Are you sure you want to delete the "${zoneToDelete.name}" safe zone? This action cannot be undone.`,
      () => {
        setUserSettings(current => {
          const currentUserSettings = current[currentUser.id] || { safeZones: [] };
          const updatedSafeZones = currentUserSettings.safeZones.filter(z => z.id !== zoneId);
          return { ...current, [currentUser.id]: { ...currentUserSettings, safeZones: updatedSafeZones } };
        });
        addNotification({type: 'error', title: 'Safe Zone Deleted', message: `"${zoneToDelete.name}" has been deleted.`});
        setEditingZone(null);
      }
    );
  };

  const getActiveChatMessages = () => {
    const chatId = getChatId(activeChat);
    return chatId ? chatMessages[chatId] || [] : [];
  };

  const handleSetChatBackground = (chatId: string, background: ChatBackground | null) => {
    setChatBackgrounds(prev => {
        const newBgs = { ...prev };
        if (background) {
            newBgs[chatId] = background;
        } else {
            delete newBgs[chatId];
        }
        return newBgs;
    });
  };

  const handleStartVideoCall = (target: FamilyMember | 'group') => { setCallTarget(target); setIsCalling(true); };
  const handleEndVideoCall = () => { setIsCalling(false); setCallTarget(null); };
  
  const handleStartNavigation = (target: NavigationTarget) => {
    if ('isCurrentUser' in target && target.isCurrentUser) {
        addNotification({type: 'error', title: 'Navigation Error', message: "You cannot navigate to your own location."});
        return;
    }
    setNavigationTarget(target);
    setRouteInfo(null); // Clear old route
    setCurrentStepIndex(0);
    setSpokenInstructions(new Set());
  }

  const handleCancelNavigation = () => {
    setNavigationTarget(null);
    setRouteInfo(null);
    setCurrentStepIndex(0);
    setSpokenInstructions(new Set());
    cancelSpeech();
  }

  const handleFindMyDevice = (memberId: string) => {
    if (ringingDeviceId) return; // Don't allow multiple devices to ring at once
    const member = familyMembers.find(m => m.id === memberId);
    if (member) {
        setRingingDeviceId(memberId);
        addNotification({
            type: 'find-device',
            title: 'Finding Device',
            message: `A loud sound is now playing on ${member.name}'s device.`
        });
        setTimeout(() => setRingingDeviceId(null), 10000); // Ring for 10 seconds
    }
  };
  
  // Effect for fetching and updating route
  React.useEffect(() => {
    const currentUserLocation = familyMembers.find(m => m.isCurrentUser);
    if (!navigationTarget || !currentUserLocation) {
        if(routeInfo) setRouteInfo(null);
        return;
    };

    const fetchRoute = async () => {
        const start = currentUserLocation;
        const end = navigationTarget;
        
        const mapboxLangCode = 'en';
        
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start.lng},${start.lat};${end.lng},${end.lat}?alternatives=false&geometries=geojson&overview=full&steps=true&voice_instructions=true&language=${mapboxLangCode}&access_token=${MAPBOX_API_KEY}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const newRouteInfo: RouteInfo = {
                    path: route.geometry.coordinates.map((p: [number, number]) => [p[1], p[0]]), // Swap lng/lat for Leaflet
                    distance: route.distance,
                    duration: route.duration,
                    steps: route.legs[0].steps,
                };

                // Check for arrival
                if (newRouteInfo.distance < 30) {
                    addNotification({ type: 'arrival', title: 'You have arrived!', message: `You've reached ${navigationTarget.name}.` });
                    const arrivalText = 'You have arrived at your destination.';
                    speak(arrivalText);
                    handleCancelNavigation();
                } else {
                    setRouteInfo(newRouteInfo);
                }
            }
        } catch (error) {
            console.error("Error fetching directions:", error);
            addNotification({ type: 'error', title: 'Navigation Error', message: 'Could not calculate the route.' });
            handleCancelNavigation();
        }
    }
    fetchRoute();
    
  }, [navigationTarget, familyMembers.find(m => m.isCurrentUser)?.lat, familyMembers.find(m => m.isCurrentUser)?.lng]);

  // Effect for voice instructions
  React.useEffect(() => {
      const performVoiceInstruction = async () => {
          if (!navigationTarget || !routeInfo || !currentUser) return;
          
          const currentUserLocation = familyMembers.find(m => m.isCurrentUser);
          if (!currentUserLocation) return;
          
          let nextStepIndex = currentStepIndex;
          while (nextStepIndex < routeInfo.steps.length) {
              const step = routeInfo.steps[nextStepIndex];
              const instructionKey = `${nextStepIndex}-${step.maneuver.instruction}`;
              if (!spokenInstructions.has(instructionKey)) {
                  break; 
              }
              nextStepIndex++;
          }

          if (nextStepIndex >= routeInfo.steps.length) return; 

          const nextStep = routeInfo.steps[nextStepIndex];
          const [lng, lat] = nextStep.maneuver.location;
          const distanceToNextStep = getDistance(currentUserLocation.lat, currentUserLocation.lng, lat, lng);

          const voiceInstruction = (nextStep.voiceInstructions || []).find(vi => vi.announcement);
          if (distanceToNextStep < 50 && voiceInstruction) {
              
              speak(voiceInstruction.announcement);
              const instructionKey = `${nextStepIndex}-${nextStep.maneuver.instruction}`;
              setSpokenInstructions(prev => new Set(prev).add(instructionKey));
              setCurrentStepIndex(nextStepIndex);
          }
      };

      performVoiceInstruction();

  }, [navigationTarget, routeInfo, currentUser, familyMembers, spokenInstructions, currentStepIndex]);


  const renderContent = () => {
    switch (appState) {
      case AppState.SPLASH: return <SplashScreen />;
      case AppState.ONBOARDING: return <Onboarding onComplete={handleOnboardingComplete} />;
      case AppState.AUTH: return <Auth onLoginSuccess={handleLoginSuccess} onAddNotification={addNotification} />;
      case AppState.VERIFICATION: return (<div className="h-screen w-screen flex flex-col bg-base-100"><EmailVerificationBanner onResend={handleVerificationResend} /><div className="flex-grow flex items-center justify-center text-center p-4"><h1 className="text-2xl font-bold text-text-primary">Please check your inbox to verify your email.</h1></div></div>);
      case AppState.PROFILE_SETUP: return <ProfileSetup onComplete={handleProfileSetupComplete} onAddNotification={addNotification} />;
      case AppState.MAIN_APP:
        if (!currentUser) return <Auth onLoginSuccess={handleLoginSuccess} onAddNotification={addNotification} />;
        if (isCalling && callTarget) {
            const hostId = (callTarget === 'group' && joinedCircle) ? joinedCircle.owner.id : null;
            return <VideoCallView currentUser={currentUser} callTarget={callTarget} hostId={hostId} familyMembers={familyMembers} onEndCall={handleEndVideoCall} onAddNotification={addNotification} />;
        }
        const userSafeZones = (currentUser && userSettings[currentUser.id]?.safeZones) || [];
        return (
            <div className="h-screen w-screen relative overflow-hidden">
                <NotificationContainer notifications={notifications} onClose={removeNotification} />
                <ConfirmationModal isOpen={confirmationState.isOpen} title={confirmationState.title} message={confirmationState.message} onConfirm={handleConfirmAction} onCancel={() => setConfirmationState(prev => ({ ...prev, isOpen: false }))} isLoading={isLoading}/>
                
                {mainView === 'map' && (
                  isMapReady ? (
                    <MapView 
                        familyMembers={familyMembers} 
                        safeZones={userSafeZones}
                        navigationTarget={navigationTarget}
                        routeInfo={routeInfo}
                        currentStepIndex={currentStepIndex}
                        ringingDeviceId={ringingDeviceId}
                        onStartChat={handleStartPrivateChat} 
                        onSaveSafeZone={handleSaveSafeZone}
                        onZoneClick={setEditingZone}
                        onShowHistory={handleShowHistory}
                        onStartNavigation={handleStartNavigation}
                        onCancelNavigation={handleCancelNavigation}
                        onFindMyDevice={handleFindMyDevice}
                        onAddNotification={addNotification} 
                    />
                  ) : ( <MapPlaceholder /> )
                )}
                {mainView === 'chat' && <ChatView currentUser={currentUser} chatTarget={activeChat} messages={getActiveChatMessages()} onSendMessage={handleSendMessage} joinedCircle={joinedCircle} onNavigateToSettings={() => setMainView('settings')} onAddNotification={addNotification} onStartVideoCall={handleStartVideoCall} onOpenMessageActions={handleOpenMessageActions} chatBackgrounds={chatBackgrounds} onSetChatBackground={(background) => { const chatId = getChatId(activeChat); if (chatId) { handleSetChatBackground(chatId, background) }}} familyMembers={familyMembers} />}
                {mainView === 'settings' && <SettingsView user={currentUser} myCircleMembers={myCircleMembers} joinedCircle={joinedCircle} safeZones={userSafeZones} onLogout={handleLogout} onUpdateProfile={handleUpdateProfile} onToggleLocationSharing={handleLocationSharingToggle} onJoinCircle={handleJoinCircle} onRequestConfirmation={handleRequestConfirmation} onLeaveCircle={handleLeaveCircle} onRemoveMember={handleRemoveMember} onAddNotification={addNotification} onEditSafeZone={setEditingZone} isLoading={isLoading} notificationPermission={notificationPermission} onRequestNotificationPermission={handleRequestNotificationPermission} />}
                {appState === AppState.MAIN_APP && notificationPermission === 'default' && !isPermissionBannerDismissed && (
                  <NotificationPermissionBanner
                    onEnable={() => {
                      handleRequestNotificationPermission();
                      setIsPermissionBannerDismissed(true);
                    }}
                    onDismiss={() => setIsPermissionBannerDismissed(true)}
                  />
                )}
                <BottomNavBar currentView={mainView} setView={handleNavChange} />
                {historyViewMember && <LocationHistoryView member={historyViewMember} onClose={handleCloseHistory} />}
                {editingZone && (
                    <EditSafeZoneModal
                        zone={editingZone}
                        onClose={() => setEditingZone(null)}
                        onUpdate={handleUpdateSafeZone}
                        onDelete={handleDeleteSafeZone}
                    />
                )}
                 <MessageActionMenu
                    isOpen={messageActionMenu.isOpen}
                    message={messageActionMenu.message}
                    position={messageActionMenu.position}
                    currentUser={currentUser}
                    onClose={handleCloseMessageActions}
                    onDeleteForMe={handleDeleteMessageForMe}
                    onDeleteForEveryone={handleDeleteMessageForEveryone}
                />
            </div>
        );
      default: return <SplashScreen />;
    }
  };

  const showAnimatedBackground = appState === AppState.SPLASH || appState === AppState.ONBOARDING || appState === AppState.AUTH;

  return (
    <div className="h-screen w-screen">
        {showAnimatedBackground && <AnimatedMapBackground />}
        {renderContent()}
    </div>
  );
};

export default App;
