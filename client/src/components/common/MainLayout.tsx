import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServers } from '../../store/serverSlice';
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

export default function MainLayout() {
  const dispatch = useAppDispatch();
  const { showSettings, showCreateServer, showJoinServer, showMemberList } = useAppSelector((state) => state.ui);
  const { currentServer } = useAppSelector((state) => state.servers);

  useEffect(() => {
    dispatch(fetchServers());
  }, [dispatch]);

  return (
    <>
      <div className="app-layout">
        <ServerList />
        <Routes>
          {/* DM / Friends routes */}
          <Route path="@me" element={
            <>
              <DmSidebar />
              <FriendsPage />
            </>
          } />
          <Route path="@me/:conversationId" element={
            <>
              <DmSidebar />
              <DmChatArea />
            </>
          } />
          {/* Server routes */}
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

      {showSettings && <SettingsOverlay />}
      {showCreateServer && <CreateServerModal />}
      {showJoinServer && <JoinServerModal />}
    </>
  );
}
