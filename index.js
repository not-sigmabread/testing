// Import the socket.io client library
import io from 'socket.io-client';

// Initialize socket connection
const socket = io('http://localhost:3000');

// State management
let currentUser = null;
let currentChannel = 'general';
let typingTimeout = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const chatInterface = document.getElementById('chat-interface');
const authForm = document.getElementById('auth-form');
const guestButton = document.getElementById('guest-button');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const currentUserDisplay = document.getElementById('current-user');
const currentRoleDisplay = document.getElementById('current-role');
const onlineUsers = document.getElementById('online-users');

// Authentication handlers
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    socket.emit('auth', { username, password, isGuest: false });
});

guestButton.addEventListener('click', () => {
    socket.emit('auth', { isGuest: true });
});

// Message form handler
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (content) {
        socket.emit('message:send', {
            channel: currentChannel,
            content
        });
        messageInput.value = '';
    }
});

// Typing indicator handler
messageInput.addEventListener('input', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    socket.emit('typing:start', { channel: currentChannel });
    
    typingTimeout = setTimeout(() => {
        socket.emit('typing:stop', { channel: currentChannel });
    }, 1000);
});

// Channel switching
document.querySelectorAll('.channel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const channel = btn.dataset.channel;
        switchChannel(channel);
    });
});

function switchChannel(channel) {
    // Update UI
    document.querySelectorAll('.channel-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.channel === channel);
    });
    messageInput.placeholder = `Message #${channel}`;
    currentChannel = channel;
    messagesContainer.innerHTML = '';
    
    // Join channel
    socket.emit('channel:join', channel);
}

// Socket event handlers
socket.on('auth:success', (user) => {
    currentUser = user;
    authScreen.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    
    currentUserDisplay.textContent = user.displayName;
    currentRoleDisplay.textContent = user.role;
    
    // Add role-based styling
    currentUserDisplay.className = `role-${user.role}`;
    
    // Join default channel
    switchChannel('general');
});

socket.on('messages:history', ({ channel, messages }) => {
    if (channel === currentChannel) {
        messagesContainer.innerHTML = '';
        messages.forEach(addMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('message:new', ({ channel, message }) => {
    if (channel === currentChannel) {
        addMessage(message);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('user:typing', ({ username, displayName }) => {
    if (username !== currentUser.username) {
        typingIndicator.textContent = `${displayName} is typing...`;
        typingIndicator.classList.remove('hidden');
    }
});

socket.on('user:stopped_typing', (username) => {
    if (username !== currentUser.username) {
        typingIndicator.classList.add('hidden');
    }
});

socket.on('users:update', (users) => {
    onlineUsers.innerHTML = users
        .map(user => `
            <div class="flex items-center space-x-2 mb-2">
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                <span class="role-${user.role}">${user.displayName}</span>
            </div>
        `)
        .join('');
});

socket.on('error', (message) => {
    // Create and show error toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
});

// Helper functions
function addMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message p-4 hover:bg-gray-800';
    
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    
    messageEl.innerHTML = `
        <div class="flex items-start space-x-2">
            <div class="flex-shrink-0">
                <div class="w-8 h-8 rounded-full bg-gray-700"></div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center space-x-2">
                    <span class="role-${message.role} font-medium">${message.displayName}</span>
                    <span class="text-xs text-gray-400">${timestamp}</span>
                </div>
                <div class="text-gray-300 break-words">${message.content}</div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageEl);
}

// Initialize tooltips and other UI elements
document.addEventListener('DOMContentLoaded', () => {
    // Add any additional initialization code here
});
