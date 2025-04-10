import { Router } from 'express';
import { createChat, getChats, deleteChat } from '../controllers/chats.js';

const router = Router();
router.get('/:sender_email', getChats);
router.post('/', createChat);
router.post('/delete/:chat_id', deleteChat)

export default router;
