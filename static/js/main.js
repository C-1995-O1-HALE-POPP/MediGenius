// DOM Elements
const chatArea = document.getElementById('chatArea');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const newChatBtn = document.getElementById('newChatBtn');
const clearBtn = document.getElementById('clearBtn');
const themeBtn = document.getElementById('themeBtn');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const attachBtn = document.getElementById('attachBtn');
const voiceBtn = document.getElementById('voiceBtn');
const downloadBtn = document.getElementById('downloadBtn');
const settingsBtn = document.getElementById('settingsBtn');

// State
let isTyping = false;
let chatHistory = [];
let currentTheme = localStorage.getItem('theme') || 'light';
let sidebarOpen = localStorage.getItem('sidebarOpen') !== 'false';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeEventListeners();
    initializeAnimations();
});

// Initialize App
function initializeApp() {
    // Set theme
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeBtn.innerHTML = '<i class="fas fa-sun"></i><div class="theme-glow"></div>';
    }
    
    // Set sidebar state
    if (sidebarOpen) {
        sidebar.classList.remove('collapsed');
        mainContent.classList.add('sidebar-open');
    } else {
        sidebar.classList.add('collapsed');
        mainContent.classList.remove('sidebar-open');
    }
    
    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        sendBtn.disabled = messageInput.value.trim() === '';
    });

    // Initialize particles
    createParticles();
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Quick buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            messageInput.value = question;
            sendBtn.disabled = false;
            animateButton(btn);
            setTimeout(() => sendMessage(), 200);
        });
    });
    
    // Sidebar toggle
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    
    // Chat controls
    newChatBtn.addEventListener('click', createNewChat);
    clearBtn.addEventListener('click', clearChat);
    themeBtn.addEventListener('click', toggleTheme);
    downloadBtn.addEventListener('click', downloadChat);
    
    // Other controls
    attachBtn.addEventListener('click', () => showToast('File attachment coming soon!', 'info'));
    voiceBtn.addEventListener('click', startVoiceInput);
    settingsBtn.addEventListener('click', () => showToast('Settings coming soon!', 'info'));
    
    // Chat item clicks
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// Initialize Animations
function initializeAnimations() {
    animateFloatingCircles();
    animateGradients();
}

// Toggle Sidebar (ChatGPT Style)
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('sidebar-open');
    
    // Save state
    sidebarOpen = !sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarOpen', sidebarOpen);
    
    // Animate button
    const icon = sidebarToggleBtn.querySelector('i');
    icon.style.transform = 'rotate(180deg)';
    setTimeout(() => {
        icon.style.transform = 'rotate(0deg)';
    }, 300);
}

// Send Message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isTyping) return;
    
    // Hide welcome screen
    if (!welcomeScreen.classList.contains('hidden')) {
        fadeOut(welcomeScreen);
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            messagesContainer.style.display = 'block';
            fadeIn(messagesContainer);
        }, 300);
    }
    
    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    // Show typing indicator
    showTyping();
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addMessage(data.response, 'bot', data.timestamp, data.source);
            showToast('Response received', 'success');
        } else {
            addMessage('Sorry, I encountered an error. Please try again.', 'bot', 
                      new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
                      'System Error');
            showToast('Error occurred', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage('Connection error. Please check your internet and try again.', 'bot', 
                  new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
                  'Connection Error');
        showToast('Connection error', 'error');
    } finally {
        hideTyping();
    }
    
    // Update chat history
    updateChatHistory(message);
}

// Add Message (with right-aligned user messages and inline timestamps)
function addMessage(content, type, timestamp = null, source = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    messageDiv.style.opacity = '0';
    
    const time = timestamp || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    if (type === 'user') {
        // User message - right aligned with inline timestamp
        messageDiv.innerHTML = `
            <div class="message-wrapper">
                <div class="message-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="message-content">
                    <div class="message-text">
                        ${content}
                        <span class="message-time">${time}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Bot message - left aligned
        let footerHtml = '';
        if (source || type === 'bot') {
            footerHtml = `
                <div class="message-footer">
                    ${source ? `
                        <span class="message-source">
                            <i class="fas fa-database"></i>
                            ${source}
                        </span>
                    ` : ''}
                    <div class="message-actions">
                        <button class="message-action" onclick="copyMessage('${encodeURIComponent(content)}')" title="Copy">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="message-action" onclick="regenerateResponse()" title="Regenerate">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        
        messageDiv.innerHTML = `
            <div class="message-wrapper">
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <div class="message-text">
                        ${content}
                    </div>
                    <span class="message-time">${time}</span>
                    ${footerHtml}
                </div>
            </div>
        `;
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // Fade in animation
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        messageDiv.style.opacity = '1';
    }, 100);
    
    smoothScrollToBottom();
    
    // Save to history
    chatHistory.push({ content, type, timestamp: time, source });
}

// Typing Indicator
function showTyping() {
    isTyping = true;
    typingIndicator.classList.add('active');
    fadeIn(typingIndicator);
    smoothScrollToBottom();
}

function hideTyping() {
    isTyping = false;
    fadeOut(typingIndicator);
    setTimeout(() => {
        typingIndicator.classList.remove('active');
    }, 300);
}

function smoothScrollToBottom() {
    chatArea.scrollTo({
        top: chatArea.scrollHeight,
        behavior: 'smooth'
    });
}

// Theme Toggle
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    // Animate theme button
    const icon = themeBtn.querySelector('i');
    icon.style.transform = 'rotate(360deg)';
    setTimeout(() => {
        icon.className = currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        icon.style.transform = 'rotate(0deg)';
    }, 300);
    
    showToast(`${currentTheme === 'dark' ? 'Dark' : 'Light'} mode activated`, 'success');
}

// Chat Functions
async function createNewChat() {
    animateButton(newChatBtn);
    
    try {
        const response = await fetch('/api/new-chat', {
            method: 'POST'
        });
        
        if (response.ok) {
            fadeOut(messagesContainer);
            setTimeout(() => {
                messagesContainer.innerHTML = '';
                welcomeScreen.classList.remove('hidden');
                fadeIn(welcomeScreen);
                messagesContainer.style.display = 'none';
                chatHistory = [];
                showToast('New chat created', 'success');
            }, 300);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to create new chat', 'error');
    }
}

async function clearChat() {
    if (!confirm('Are you sure you want to clear this conversation?')) return;
    
    try {
        const response = await fetch('/api/clear', {
            method: 'POST'
        });
        
        if (response.ok) {
            fadeOut(messagesContainer);
            setTimeout(() => {
                messagesContainer.innerHTML = '';
                welcomeScreen.classList.remove('hidden');
                fadeIn(welcomeScreen);
                messagesContainer.style.display = 'none';
                chatHistory = [];
                showToast('Conversation cleared', 'success');
            }, 300);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to clear conversation', 'error');
    }
}

function downloadChat() {
    if (chatHistory.length === 0) {
        showToast('No messages to download', 'error');
        return;
    }
    
    animateButton(downloadBtn);
    
    let content = 'MediGenius Chat Export\n';
    content += '='.repeat(50) + '\n\n';
    
    chatHistory.forEach((msg) => {
        content += `[${msg.timestamp}] ${msg.type === 'user' ? 'You' : 'MediGenius'}:\n`;
        content += msg.content + '\n';
        if (msg.source) {
            content += `Source: ${msg.source}\n`;
        }
        content += '\n';
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medigenius-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Chat downloaded successfully', 'success');
}

// Helper Functions
function copyMessage(encodedContent) {
    const content = decodeURIComponent(encodedContent);
    navigator.clipboard.writeText(content).then(() => {
        showToast('Message copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy message', 'error');
    });
}

function regenerateResponse() {
    showToast('Regenerating response...', 'info');
    // Implement regeneration logic
}

function updateChatHistory(message) {
    const chatList = document.getElementById('chatList');
    const newItem = document.createElement('div');
    newItem.className = 'chat-item glass-item';
    newItem.style.opacity = '0';
    newItem.innerHTML = `
        <i class="fas fa-message"></i>
        <span>${message.substring(0, 30)}${message.length > 30 ? '...' : ''}</span>
        <div class="item-glow"></div>
    `;
    
    // Remove active class from previous items
    chatList.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add click event
    newItem.addEventListener('click', function() {
        document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
    
    chatList.insertBefore(newItem, chatList.firstChild.nextSibling);
    
    // Fade in animation
    setTimeout(() => {
        newItem.style.transition = 'opacity 0.3s ease';
        newItem.style.opacity = '1';
        newItem.classList.add('active');
    }, 100);
}

// Voice Input
function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window)) {
        showToast('Voice input not supported in your browser', 'error');
        return;
    }
    
    animateButton(voiceBtn);
    
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        voiceBtn.style.color = 'var(--accent)';
        showToast('Listening...', 'info');
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        messageInput.value = transcript;
        sendBtn.disabled = false;
        voiceBtn.style.color = '';
    };
    
    recognition.onerror = () => {
        voiceBtn.style.color = '';
        showToast('Voice recognition error', 'error');
    };
    
    recognition.start();
}

// Toast Notifications
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'info': 'fa-info-circle'
    };
    
    const colors = {
        'success': 'linear-gradient(135deg, #10b981, #059669)',
        'error': 'linear-gradient(135deg, #ef4444, #dc2626)',
        'info': 'linear-gradient(135deg, #3b82f6, #2563eb)'
    };
    
    toast.style.background = colors[type];
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span id="toastMessage">${message}</span>`;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Animation Utilities
function fadeIn(element, duration = 300) {
    element.style.opacity = '0';
    element.style.display = 'block';
    element.style.transition = `opacity ${duration}ms ease`;
    setTimeout(() => {
        element.style.opacity = '1';
    }, 10);
}

function fadeOut(element, duration = 300) {
    element.style.transition = `opacity ${duration}ms ease`;
    element.style.opacity = '0';
}

function animateButton(button) {
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = 'scale(1)';
    }, 200);
}

// Floating Circles Animation
function animateFloatingCircles() {
    const circles = document.querySelectorAll('.circle');
    circles.forEach((circle, index) => {
        setInterval(() => {
            const x = Math.random() * 40 - 20;
            const y = Math.random() * 40 - 20;
            circle.style.transform = `translate(${x}px, ${y}px)`;
        }, 3000 + index * 500);
    });
}

// Gradient Animation
function animateGradients() {
    const gradientElements = document.querySelectorAll('.gradient-text');
    gradientElements.forEach(element => {
        let position = 0;
        setInterval(() => {
            position = (position + 1) % 200;
            element.style.backgroundPosition = `${position}% 50%`;
        }, 50);
    });
}

// Create Particle Field
function createParticles() {
    const particleField = document.getElementById('particleField');
    if (!particleField) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(102, 126, 234, 0.3);
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${10 + Math.random() * 20}s linear infinite;
        `;
        particleField.appendChild(particle);
    }
}

// CSS Animations
const style = document.createElement('style');
style.textContent = `
    @keyframes particleFloat {
        from { transform: translateY(100vh) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        to { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
    }
    
    .sidebar-toggle-btn i {
        transition: transform 0.3s ease;
    }
`;
document.head.appendChild(style);

// Make functions globally available
window.copyMessage = copyMessage;
window.regenerateResponse = regenerateResponse;
