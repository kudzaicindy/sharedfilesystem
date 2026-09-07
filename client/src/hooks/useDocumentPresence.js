import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import { useAuth } from '../context/AuthContext';

/**
 * Live list of other users viewing/editing the same document (Socket.IO presence).
 */
export function useDocumentPresence(docId) {
  const socketRef = useSocket();
  const { user } = useAuth();
  const [others, setOthers] = useState([]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !docId || !user?._id) return undefined;

    const onPresence = (users) => {
      const list = Array.isArray(users) ? users : [];
      const me = String(user._id || user.id);
      setOthers(list.filter(u => String(u.userId) !== me));
    };

    const join = () => {
      socket.emit('join:document', { docId, name: user.name || 'User' });
    };
    join();

    socket.on('connect', join);
    socket.on('presence:update', onPresence);

    return () => {
      socket.emit('leave:document', { docId });
      socket.off('connect', join);
      socket.off('presence:update', onPresence);
    };
  }, [docId, user?._id, socketRef]);

  return others;
}
