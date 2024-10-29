import React from 'react';

const Sidebar = ({ onlineUsers, user, onLogout }) => {
  return (
    <div className="w-1/4 bg-gray-100 p-4 border-r flex flex-col">
      <h2 className="text-lg font-semibold mb-4">Online Users</h2>
      <ul className="flex flex-col gap-2">
        {onlineUsers.map((user) => (
          <li key={user.uid} className="flex items-center jusitfy-between mb-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={`${user.email}'s Avatar`}
                className="w-8 h-8 rounded-full mr-2 object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=random`;
                }}
              />
            ) : (
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-2 text-white font-semibold">
                {user.email ? user.email.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <span className="text-left font-semibold truncate">{user.email}</span>
            <span className={`ml-auto min-w-3 w-3 min-h-3 h-3 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </li>
        ))}
      </ul>
      <button 
        onClick={onLogout} 
        className="mt-auto bg-red-500 text-white p-2 rounded"
      >
        Logout
      </button>
    </div>
  );
};

export default Sidebar;
