import React, {useState, useRef, useEffect} from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import { firebaseConfig } from './firebase.config';

import {useAuthState} from 'react-firebase-hooks/auth';
import {useCollectionData} from 'react-firebase-hooks/firestore';

// Import the bad words list
import badWords from './badwords';

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const firestore = firebase.firestore();

// Collection to store banned users
const bannedUsersRef = firestore.collection('bannedUsers');

/**
 * Filters bad words from a message, replacing them with asterisks
 * @param {string} message - The message to filter
 * @returns {object} - Object containing filtered message and whether bad words were found
 */
const filterBadWords = (message) => {
  let containsBadWords = false;
  let filteredMessage = message;
  
  // Check each bad word in the list
  badWords.forEach(word => {
    // Create a case-insensitive regular expression for the bad word
    // This handles the word appearing as part of another word or with different casing
    const regex = new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    
    // Check if the message contains the bad word
    if (regex.test(filteredMessage)) {
      containsBadWords = true;
      
      // Replace the bad word with asterisks of the same length
      filteredMessage = filteredMessage.replace(regex, match => '*'.repeat(match.length));
    }
  });
  
  return {
    filteredMessage,
    containsBadWords
  };
};


function App() {

  const [user] = useAuthState(auth);

  return (
    <div className="App">
      <header>
        <h1>ImgoChat</h1>
        <SignOut />
      </header>
      
      <section>
        {user ? <ChatRoom /> : <SignIn />}
      </section>
    </div>
  );
}

function SignIn() {
  const signInWithGoogle = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
  };

  return (
    <div className="imgochat-login">
      <div className="imgochat-login-header">
        <h2>ImgoChat</h2>
        <p>Sign in with your account to start chatting</p>
      </div>
      <button className="sign-in" onClick={signInWithGoogle}>
        <img src="/googleLogo.jpg" alt="Google logo"/>
        Sign in with Google
      </button>
    </div>
  )
}

function SignOut() {
  return auth.currentUser && (
    <button className="sign-out" onClick={() => auth.signOut()}>Sign Out</button>
  )
}

function ChatRoom() {

  const dummy = useRef();

  const messageRef = firestore.collection('/messages');
  const query = messageRef.orderBy('createdAt').limit(100);
  
  const [messages] = useCollectionData(query, {idField: 'id'});
  const [formValue, setFormValue] = useState('');

  const sendMessage = async (e) => {
    e.preventDefault();
    
    try {

      console.log('Sending message, checking auth state...');
      if (!auth.currentUser) {
        console.error('No authenticated user found when sending message');
        return;
      }

      const {uid, photoURL, displayName} = auth.currentUser;
      console.log('Message from user:', uid, displayName);
      
      // Filter the message for bad words
      console.log('Filtering message for bad words...');
      const { filteredMessage, containsBadWords } = filterBadWords(formValue);
      console.log('Message filtered, contains bad words:', containsBadWords);

      // Add the filtered message to the database
      console.log('Adding message to Firestore...');
      try {
        await messageRef.add({
          text: filteredMessage, // Use the filtered message
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          uid,
          photoURL,
          displayName: displayName || 'Anonymous' // Store the user's display name
        });
        console.log('Message successfully added to Firestore');
      } catch (messageError) {
        console.error('Error adding message to Firestore:', messageError);
        throw messageError; // Re-throw to be caught by outer try/catch
      }

      setFormValue('');
      dummy.current.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Error in sendMessage:', error);
      // You could add user-facing error handling here
    }
  }

  // Group messages by date for timestamp dividers
  const groupMessagesByTime = () => {
    if (!messages) return [];
    
    const result = [];
    let lastTimestamp = null;
    
    messages.forEach(msg => {
      const msgTime = msg.createdAt ? new Date(msg.createdAt.toDate()) : new Date();
      const msgDate = msgTime.toLocaleDateString();
      
      // Add timestamp divider if it's a new date or first message
      if (!lastTimestamp || lastTimestamp !== msgDate) {
        result.push({ isTimestamp: true, date: msgDate, id: `timestamp-${msgDate}` });
        lastTimestamp = msgDate;
      }
      
      result.push(msg);
    });
    
    return result;
  };
  
  const groupedMessages = groupMessagesByTime();
  
  return (
    <>
      <main>
        <div className="imgochat-notification">
          Welcome to ImgoChat! You are now online.
        </div>
        
        {groupedMessages.map(item => {
          if (item.isTimestamp) {
            return (
              <div key={item.id} className="timestamp-divider">
                {item.date}
              </div>
            );
          }
          return <ChatMessage key={item.id} message={item} />;
        })}

      <div ref={dummy} ></div>
    </main>
      <form onSubmit={sendMessage}>
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="Type a message..." 
        />
        <button type="submit">Send</button>
      </form>
    </>
  )
}

function ChatMessage(props) {
  const {text, uid, photoURL, createdAt, displayName: msgDisplayName} = props.message;

  const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
  const defaultPhotoURL = '/defaultpfp.webp';
  
  // Format timestamp
  const timestamp = createdAt ? new Date(createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
  
  // For current user, use "You" if no name available
  // For other users, use "Guest" if no name available
  let displayName;
  if (msgDisplayName) {
    // If it's the current user, show "You" instead of name
    displayName = uid === auth.currentUser?.uid ? 'You' : msgDisplayName;
  } else {
    // Fallbacks if no name was stored with the message
    displayName = uid === auth.currentUser?.uid ? 'You' : 'Guest';
  }
  
  // Handle image error by replacing with default image
  const handleImageError = (e) => {
    console.log('Profile image failed to load, using default');
    e.target.src = defaultPhotoURL;
  };
  
  return (
    <div className={`message ${messageClass}`}>
      <img 
        src={photoURL || defaultPhotoURL} 
        alt="pfp" 
        onError={handleImageError}
      />
      <div className="message-content">
        <div className="message-sender">
          <span className="status-indicator"></span>
          {displayName}
        </div>
        <p>{text}</p>
        {timestamp && <div className="message-time">{timestamp}</div>}
      </div>
    </div>
  )
}

export default App;
