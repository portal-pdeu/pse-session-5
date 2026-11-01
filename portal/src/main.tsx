import { createRoot } from 'react-dom/client'
import './appwrite' // creates the Appwrite client and pings once at startup
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
