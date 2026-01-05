import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentDrawer } from '../../src/components/AgentDrawer/AgentDrawer';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useUrlStore } from '../../src/stores/urlStore';

// Mock react-markdown to avoid complex rendering
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock remark-gfm
vi.mock('remark-gfm', () => ({
  default: () => {},
}));

// Mock the ConversationSelector
vi.mock('../../src/components/ConversationSelector/ConversationSelector', () => ({
  ConversationSelector: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="conversation-selector">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

describe('AgentDrawer', () => {
  beforeEach(() => {
    // Reset stores
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingMessage: null,
      isStreaming: false,
      error: null,
    });

    useConnectionStore.setState({
      socket: null,
      isConnected: true,
      isConnecting: false,
      error: null,
    });

    // Reset URL store - drawer starts closed by default
    useUrlStore.setState({
      route: 'home',
      conversationId: null,
      openingId: null,
      moveIndex: null,
      drawerOpen: false,
      drawerWidth: 400,
    });
  });

  describe('Initial Render', () => {
    it('should render toggle button', () => {
      render(<AgentDrawer />);
      const toggle = screen.getByTitle('Chat with AI coach');
      expect(toggle).toBeInTheDocument();
    });

    it('should start closed', () => {
      render(<AgentDrawer />);
      const drawer = document.querySelector('.agent-drawer');
      expect(drawer).not.toHaveClass('open');
    });

    it('should show empty state when no messages', () => {
      render(<AgentDrawer />);
      // Open the drawer first
      fireEvent.click(screen.getByTitle('Chat with AI coach'));
      
      expect(screen.getByText(/Ask me about openings/)).toBeInTheDocument();
    });
  });

  describe('Opening/Closing', () => {
    it('should open when toggle is clicked', () => {
      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));
      
      const drawer = document.querySelector('.agent-drawer');
      expect(drawer).toHaveClass('open');
    });

    it('should close when close button is clicked', () => {
      render(<AgentDrawer />);
      // Open
      fireEvent.click(screen.getByTitle('Chat with AI coach'));
      // Close
      fireEvent.click(screen.getByText('×'));
      
      const drawer = document.querySelector('.agent-drawer');
      expect(drawer).not.toHaveClass('open');
    });
  });

  describe('Message Display', () => {
    it('should display user messages', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              {
                id: 'msg-1',
                conversationId: 'conv-1',
                role: 'user',
                content: 'Hello, chess coach!',
                timestamp: Date.now(),
              },
            ],
          },
        ],
        activeConversationId: 'conv-1',
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      expect(screen.getByText('Hello, chess coach!')).toBeInTheDocument();
    });

    it('should display assistant messages with markdown', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              {
                id: 'msg-1',
                conversationId: 'conv-1',
                role: 'assistant',
                content: 'The **Italian Game** is a classic opening.',
                timestamp: Date.now(),
              },
            ],
          },
        ],
        activeConversationId: 'conv-1',
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      // Check that markdown component received the content
      const markdown = screen.getByTestId('markdown');
      expect(markdown).toHaveTextContent('The **Italian Game** is a classic opening.');
    });

    it('should display multiple messages in order', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              {
                id: 'msg-1',
                conversationId: 'conv-1',
                role: 'user',
                content: 'What is e4?',
                timestamp: Date.now(),
              },
              {
                id: 'msg-2',
                conversationId: 'conv-1',
                role: 'assistant',
                content: 'e4 is the most popular opening move.',
                timestamp: Date.now(),
              },
            ],
          },
        ],
        activeConversationId: 'conv-1',
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const messages = document.querySelectorAll('.message');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toHaveClass('user');
      expect(messages[1]).toHaveClass('assistant');
    });
  });

  describe('Streaming', () => {
    it('should show streaming message while streaming', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          },
        ],
        activeConversationId: 'conv-1',
        streamingMessage: {
          conversationId: 'conv-1',
          messageId: 'stream-1',
          content: 'I am currently typing...',
        },
        isStreaming: true,
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      expect(screen.getByText('I am currently typing...')).toBeInTheDocument();
      expect(document.querySelector('.message.streaming')).toBeInTheDocument();
      expect(screen.getByText('▊')).toBeInTheDocument(); // Cursor
    });

    it('should disable input while streaming', () => {
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        streamingMessage: null,
        isStreaming: true,
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      expect(textarea).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message', () => {
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        streamingMessage: null,
        isStreaming: false,
        error: 'Connection lost',
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      expect(screen.getByText('Connection lost')).toBeInTheDocument();
      expect(document.querySelector('.message.error')).toBeInTheDocument();
    });
  });

  describe('Input Form', () => {
    it('should allow typing in the textarea', () => {
      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });

      expect(textarea).toHaveValue('Hello!');
    });

    it('should disable send button when input is empty', () => {
      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const button = screen.getByText('Send');
      expect(button).toBeDisabled();
    });

    it('should enable send button when input has text', () => {
      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });

      const button = screen.getByText('Send');
      expect(button).not.toBeDisabled();
    });

    it('should clear input after submit', () => {
      // Mock the connection store functions
      const mockSendMessage = vi.fn();
      const mockCreateConversation = vi.fn(() => 'new-conv-id');
      
      useConnectionStore.setState({
        socket: {} as any,
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: mockSendMessage,
        createConversation: mockCreateConversation,
      } as any);

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });
      
      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(textarea).toHaveValue('');
    });

    it('should submit on Enter key (without Shift)', () => {
      const mockSendMessage = vi.fn();
      const mockCreateConversation = vi.fn(() => 'new-conv-id');
      
      useConnectionStore.setState({
        socket: {} as any,
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: mockSendMessage,
        createConversation: mockCreateConversation,
      } as any);

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(mockCreateConversation).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith('new-conv-id', 'Hello!');
    });

    it('should NOT submit on Shift+Enter (allow newline)', () => {
      const mockSendMessage = vi.fn();
      
      useConnectionStore.setState({
        socket: {} as any,
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: mockSendMessage,
      } as any);

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Conversation Creation', () => {
    it('should create conversation when sending first message', () => {
      const mockSendMessage = vi.fn();
      const mockCreateConversation = vi.fn(() => 'new-conv-id');
      
      useConnectionStore.setState({
        socket: {} as any,
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: mockSendMessage,
        createConversation: mockCreateConversation,
      } as any);

      // No active conversation
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        streamingMessage: null,
        isStreaming: false,
        error: null,
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });
      
      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(mockCreateConversation).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith('new-conv-id', 'Hello!');
    });

    it('should use existing conversation when available', () => {
      const mockSendMessage = vi.fn();
      const mockCreateConversation = vi.fn();
      
      useConnectionStore.setState({
        socket: {} as any,
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: mockSendMessage,
        createConversation: mockCreateConversation,
      } as any);

      useConversationStore.setState({
        conversations: [
          {
            id: 'existing-conv',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          },
        ],
        activeConversationId: 'existing-conv',
        streamingMessage: null,
        isStreaming: false,
        error: null,
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      fireEvent.change(textarea, { target: { value: 'Hello!' } });
      
      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith('existing-conv', 'Hello!');
    });
  });

  describe('Disconnected State', () => {
    it('should disable input when disconnected', () => {
      useConnectionStore.setState({
        socket: null,
        isConnected: false,
        isConnecting: false,
        error: null,
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));

      const textarea = screen.getByPlaceholderText('Ask about this position...');
      expect(textarea).toBeDisabled();
    });
  });

  describe('Message Badge', () => {
    it('should show message count when drawer is closed', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              { id: '1', conversationId: 'conv-1', role: 'user', content: 'Hi', timestamp: Date.now() },
              { id: '2', conversationId: 'conv-1', role: 'assistant', content: 'Hello', timestamp: Date.now() },
              { id: '3', conversationId: 'conv-1', role: 'user', content: 'Thanks', timestamp: Date.now() },
            ],
          },
        ],
        activeConversationId: 'conv-1',
      });

      render(<AgentDrawer />);
      
      // Drawer is closed by default
      const badge = document.querySelector('.message-badge');
      expect(badge).toHaveTextContent('3');
    });

    it('should hide badge when drawer is open', () => {
      useConversationStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              { id: '1', conversationId: 'conv-1', role: 'user', content: 'Hi', timestamp: Date.now() },
            ],
          },
        ],
        activeConversationId: 'conv-1',
      });

      render(<AgentDrawer />);
      fireEvent.click(screen.getByTitle('Chat with AI coach'));
      
      const badge = document.querySelector('.message-badge');
      expect(badge).not.toBeInTheDocument();
    });
  });
});

