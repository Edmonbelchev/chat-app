// src/App.js
import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase"; // Import Firebase
import { onAuthStateChanged } from "firebase/auth"; // Import Auth state change
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  setDoc,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore"; // Import Firestore
import Auth from "./Auth"; // Import Auth component
import Sidebar from "./Sidebar"; // Import Sidebar component
import { format } from "date-fns"; // Import date-fns for formatting dates

function App() {
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]); // State for online users
  const [heartbeatInterval, setHeartbeatInterval] = useState(null); // State for heartbeat interval
  const [unsubscribeMessages, setUnsubscribeMessages] = useState(null); // State for messages unsubscribe
  const [unsubscribeOnlineUsers, setUnsubscribeOnlineUsers] = useState(null); // State for online users unsubscribe
  const [lastVisible, setLastVisible] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef(null); // Create a ref for the bottom of messages
  const messagesContainerRef = useRef(null); // Reference for the messages container
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const cleanup = async (userId) => {
    // Clear all listeners first
    if (unsubscribeMessages) {
      unsubscribeMessages();
      setUnsubscribeMessages(null);
    }
    if (unsubscribeOnlineUsers) {
      unsubscribeOnlineUsers();
      setUnsubscribeOnlineUsers(null);
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      setHeartbeatInterval(null);
    }
    
    // Clear states
    setMessages([]);
    setOnlineUsers([]);
    
    // Remove user from online users collection if userId is provided
    if (userId) {
      try {
        await deleteDoc(doc(db, "onlineUsers", userId));
      } catch (error) {
        console.error("Error removing user from online users:", error);
      }
    }
  };

  useEffect(() => {
    let unsubscribeAuth;
    
    const setupAuth = () => {
      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUser(user);
          // Check if user is already in online users collection
          const q = query(
            collection(db, "onlineUsers"),
            where("uid", "==", user.uid)
          );
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            // Add user to online users collection if not already present
            await setDoc(doc(db, "onlineUsers", user.uid), {
              uid: user.uid,
              email: user.email,
              avatar: user.photoURL,
              lastActive: new Date(), // Track last active time
              status: 'active' // Set initial status to active
            });
          } else {
            // If user exists, update their lastActive time and status
            await setDoc(doc(db, "onlineUsers", user.uid), {
              lastActive: new Date(), // Update last active time
              email: user.email, // Ensure email is included
              avatar: user.photoURL, // Ensure avatar is included
              status: 'active' // Set status to active
            }, { merge: true }); // Use merge to update the document without overwriting
          }

          // Heartbeat mechanism to update last active time
          const interval = setInterval(async () => {
            await setDoc(doc(db, "onlineUsers", user.uid), {
              lastActive: new Date(), // Update last active time
              status: 'active' // Update status to active
            }, { merge: true }); // Use merge to update the document without overwriting
          }, 5000); // Update every 5 seconds

          setHeartbeatInterval(interval);

          // Set up Firestore listeners
          const messagesQuery = query(
            collection(db, "messages"),
            orderBy("createdAt", "desc"),
            limit(30)
          );

          const onlineUsersQuery = query(collection(db, "onlineUsers"));

          const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
            const messagesData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setMessages(messagesData);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          });

          const unsubscribeOnlineUsers = onSnapshot(onlineUsersQuery, (snapshot) => {
            const onlineUsersData = snapshot.docs.map(doc => {
              const userData = doc.data();
              const lastActive = userData.lastActive?.toDate();
              const currentTime = new Date();
              const timeDiff = lastActive ? (currentTime - lastActive) / 1000 : 9999;
              
              return {
                id: doc.id,
                ...userData,
                // Consider user offline if they haven't been active in the last 60 seconds
                status: timeDiff < 10 ? 'active' : 'inactive'
              };
            });

            setOnlineUsers(onlineUsersData);
          });

          // Store unsubscribe functions
          setUnsubscribeMessages(() => unsubscribeMessages);
          setUnsubscribeOnlineUsers(() => unsubscribeOnlineUsers);
        } else {
          await cleanup(user?.uid);
          setUser(null);
        }
      });
    };

    setupAuth();

    return () => {
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
      cleanup();
    };
  }, []); // Remove user dependency

  const handleLogout = async () => {
    try {
      const userId = user?.uid;
      await cleanup(userId);
      await auth.signOut();
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const sendMessage = async () => {
    if (message.trim() === "") return; // Prevent sending empty messages
    await addDoc(collection(db, "messages"), {
      text: message,
      createdAt: new Date(),
      email: user.email, // Store user email with the message
      avatar: user.photoURL, // Store user avatar URL
    });
    setMessage("");
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Handle scroll events
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;
    
    // If we're within 100px of the bottom, enable auto-scroll
    setShouldAutoScroll(scrollPosition < 100);
  };

  // Scroll to bottom only for new messages, not when loading older ones
  useEffect(() => {
    if (!isLoadingMore) {
      scrollToBottom();
    }
  }, [messages, isLoadingMore]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid new line in input
      sendMessage();
    }
  };

  const loadMoreMessages = async () => {
    if (!lastVisible) return;

    setIsLoadingMore(true);
    try {
      const nextMessagesQuery = query(
        collection(db, "messages"),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(30)
      );

      const snapshot = await getDocs(nextMessagesQuery);
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setMessages(prevMessages => [...prevMessages, ...newMessages]);
      
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setLastVisible(null); // No more messages to load
      }
    } catch (error) {
      console.error("Error loading more messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (user) {
      const onlineUsersQuery = query(collection(db, "onlineUsers"));
      
      const unsubscribeOnlineUsers = onSnapshot(onlineUsersQuery, (snapshot) => {
        const onlineUsersData = snapshot.docs.map(doc => {
          const userData = doc.data();
          const lastActive = userData.lastActive?.toDate();
          const currentTime = new Date();
          // Calculate time difference in seconds
          const timeDiff = lastActive ? (currentTime - lastActive) / 1000 : 9999;
          
          return {
            id: doc.id,
            ...userData,
            // Consider user offline if they haven't been active in the last 30 seconds
            status: timeDiff < 30 ? 'active' : 'inactive'
          };
        });

        // Sort users by status (active first) and then by email
        const sortedUsers = onlineUsersData.sort((a, b) => {
          if (a.status === b.status) {
            return a.email.localeCompare(b.email);
          }
          return a.status === 'active' ? -1 : 1;
        });

        setOnlineUsers(sortedUsers);
      });

      setUnsubscribeOnlineUsers(() => unsubscribeOnlineUsers);
    }
  }, [user]);

  if (!user) {
    return <Auth />; // Show Auth component if not authenticated
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        onlineUsers={onlineUsers}
        user={user}
        onLogout={handleLogout} // Pass handleLogout function
      />
      {/* Pass user to Sidebar */}
      <div className="flex-1 flex flex-col">
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4"
        >
          {/* Load More Button */}
          {lastVisible && (
            <div className="flex justify-center mb-4">
              <button
                onClick={loadMoreMessages}
                disabled={isLoadingMore}
                className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <span className="flex items-center">
                    Loading... 
                    <svg className="animate-spin ml-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                ) : (
                  'Load Older Messages'
                )}
              </button>
            </div>
          )}

          {/* Messages */}
          {messages
            .sort((a, b) => a.createdAt.seconds - b.createdAt.seconds)
            .map((msg) => (
              <div key={msg.id} className="flex items-start mb-4">
                {msg.avatar ? (
                  <img
                    src={msg.avatar}
                    alt={`${msg.email}'s Avatar`}
                    className="w-10 h-10 rounded-full mr-2 object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.email)}&background=random`;
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-2 text-white font-semibold">
                    {msg.email ? msg.email.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div className="bg-gray-200 p-2 rounded-lg">
                  <div className="font-semibold">{msg.email}</div>
                  <div>{msg.text}</div>
                  <div className="text-xs text-gray-500">
                    {format(new Date(msg.createdAt.seconds * 1000), 'PPpp')}
                  </div>
                </div>
              </div>
            ))}
          <div ref={messagesEndRef} /> {/* Add this div at the bottom */}
        </div>
        <div className="flex p-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 border p-2 rounded"
            placeholder="Type a message"
          />
          <button
            onClick={sendMessage}
            className="ml-2 bg-blue-500 text-white p-2 rounded"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
