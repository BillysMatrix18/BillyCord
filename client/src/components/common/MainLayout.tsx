import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServers } from '../../store/serverSlice';
import { setAnnouncement } from '../../store/uiSlice';
import ServerList from '../server/ServerList';
import ChannelSidebar from '../channel/ChannelSidebar';
import ChatArea from '../chat/ChatArea';
import MemberList from '../chat/MemberList';
import FriendsPage from '../friends/FriendsPage';
import DmSidebar from '../dm/DmSidebar';
import DmChatArea from '../dm/DmChatArea';
import SettingsOverlay from '../settings/SettingsOverlay';
import CreateServerModal from '../server/CreateServerModal';
import JoinServerModal from '../server/JoinServerModal';
import DevModeOverlay from './DevModeOverlay';
import VoiceCallPanel from '../voice/VoiceCallPanel';
import IncomingCallOverlay from '../voice/IncomingCallOverlay';
import { IconX } from './Icons';

export default function MainLayout() {
  const dispatch = useAppDispatch();
  const { showSettings, showCreateServer, showJoinServer, showMemberList, announcement } = useAppSelector((state) => state.ui);
  const { currentServer } = useAppSelector((state) => state.servers);
  const [devModeEnabled] = useState(() => localStorage.getItem('devMode') === 'true');

  // Listen for devMode changes from settings
  const [devMode, setDevMode] = useState(devModeEnabled);
  useEffect(() => {
    const handleStorage = () => setDevMode(localStorage.getItem('devMode') === 'true');
    window.addEventListener('storage', handleStorage);
    // Also poll since same-window localStorage changes don't fire 'storage'
    const interval = setInterval(handleStorage, 1000);
    return () => { window.removeEventListener('storage', handleStorage); clearInterval(interval); };
  }, []);

  useEffect(() => {
    dispatch(fetchServers());
  }, [dispatch]);

  return (
    <>
      {/* Announcement banner */}
      {announcement && (
        <div className="announcement-banner animate-slide-up">
          <div className="announcement-content">
            <strong>Announcement:</strong> {announcement.message}
          </div>
          <button className="announcement-close" onClick={() => dispatch(setAnnouncement(null))}>
            <IconX size={16} />
          </button>
        </div>
      )}

      <div className="app-layout">
        <ServerList />
        <Routes>
          <Route path="@me" element={<><DmSidebar /><FriendsPage /></>} />
          <Route path="@me/:conversationId" element={<><DmSidebar /><DmChatArea /></>} />
          <Route path=":serverId/:channelId" element={
            <>
              <ChannelSidebar />
              <ChatArea />
              {showMemberList && currentServer && <MemberList />}
            </>
          } />
          <Route path=":serverId" element={
            <>
              <ChannelSidebar />
              <div className="chat-area flex items-center justify-center">
                <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>
                  Select a channel to start chatting
                </p>
              </div>
            </>
          } />
        </Routes>
      </div>

      {devMode && <DevModeOverlay />}
      <VoiceCallPanel />
      <IncomingCallOverlay />
      {showSettings && <SettingsOverlay />}
      {showCreateServer && <CreateServerModal />}
      {showJoinServer && <JoinServerModal />}
    </>
  );
}
