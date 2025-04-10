import SideBar from '../../layout/SideBar';
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

import '../../App.css';
import { useNavigate } from 'react-router-dom';

const apiUrl = import.meta.env.PROD
	? import.meta.env.VITE_API_PROD_URL
	: import.meta.env.VITE_API_URL;

console.log(import.meta.env.MODE);


let userPrompt = ``;

const MainApp = () => {
	let navigate = useNavigate();
	const [message, setMessage] = useState('');
	const [chats, setChats] = useState([]);
	const [chatID, setChatID] = useState(null);
	const [chatSystem, setChatSystem] = useState(null);

	const [isTyping, setIsTyping] = useState(false);
	const [diagnosis, setDiagnosis] = useState([]);
	const [chatsState, setChatsState] = useState({ loading: true, data: [] });
	const messagesDiv = useRef(null);
	const [userDetails, setuserDetails] = useState({});

	useEffect(() => {
		const userdata = JSON.parse(localStorage.getItem('userDetails'));
		if (userdata) {
			setuserDetails({
				name: userdata.username,
				email: userdata.email,
				gender: userdata.gender,
				age: userdata.age,
			});
		} else {
			return navigate('/signup');
		}
	}, [JSON]);

	const chat = async (e, message) => {
		e.preventDefault();
		if (!message) return;
		if (diagnosis.length) return;
		setIsTyping(true);
		console.log(chats);
		let msgs = chats;
		msgs.push({
			role: 'user',
			content: userPrompt + '\n"""' + message + '"""',
		});
		setChats(msgs);
		setMessage('');

		const data = JSON.stringify({
			chats,
			chatID,
			system: chatSystem,
			userInfo: {
				name: userDetails.name,
				age: userDetails.age,
				gender: userDetails.gender,
			},
		});
		axios({
			method: 'post',
			url: `${apiUrl}messages`,
			headers: {
				'Content-Type': 'application/json',
			},
			data,
		})
			.then((response) => {
				const data = response.data.response;

				console.log(response);
				if (data.role === 'assistant') {
					data.content = data.content.replace(/\,(?!\s*[\{\"\w])/g, '');
				}
				if (response.data?.diagnosis) {
					const diagnonsisArray = JSON.parse(response.data.diagnosis);
					setDiagnosis(diagnonsisArray);
				}
				msgs.push(data);
				setChats(msgs);
				setIsTyping(false);
			})
			.catch((error) => {
				console.log(error);
			});
	};
	const getChats = () => {
		const sender_email = userDetails?.email;

		axios({
			method: 'get',
			url: `${apiUrl}chats/${sender_email}`,
		})
			.then((response) => {
				//console.log(response);
				setChatsState({ loading: false, data: response.data.response });
			})
			.catch((error) => console.log(error));
	};

	const loadConversation = (chat_id, system, diagnoses) => {
		setChatID(chat_id);
		setChatSystem(system);
		axios({
			method: 'get',
			url: `${apiUrl}messages/${chat_id}`,
		})?.then((response) => {
			console.log('responses', response.data);
			const chatsData = response.data.response.map((item) => {
				return { content: item.content, role: item.message_type };
			});
			setChats(chatsData);
			const newDiagnosis = chatsData
				.filter(x => x.role === 'assistant')
				.flatMap(x => {
					try {
						const content = JSON.parse(x.content);
						return content?.diagnosis || [];
					} catch (error) {
						console.error('Invalid JSON in message:', x.content);
						return [];
					}
				})
				.filter(x => x && x !== "No diagnosis available")
				.filter(x => x.disease_name && x.course_of_action);

			console.log({ newDiagnosis });
			if (newDiagnosis) {
				setDiagnosis(newDiagnosis);
			}
		});
	};

	const createConversation = (system) => {
		setChats([]);
		const data = JSON.stringify({
			sender_email: userDetails?.email,
			system,
		});
		axios({
			method: 'post',
			url: `${apiUrl}chats`,
			headers: {
				'Content-Type': 'application/json',
			},
			data,
		})
			.then((response) => {
				console.log(response.data.response);
				setChatID(response.data.response[0].chat_id);
				setChatSystem(response.data.response[0].system);
			})
			.catch((error) => console.log(error));
	};

	const handleDelete = async (chatId) => {
		try {
			const response = await fetch(`${apiUrl}chats/delete/${chatId}`, {
				method: 'POST',
			});
			console.log(response);

			if (!response.ok) {
				throw new Error('Failed to delete');
			}

			// refresh the chat list after deletion
			const updatedChats = chatsState.data.filter((chat) => chat.chat_id !== chatId);
			setChatsState({ ...chatsState, data: updatedChats });

			console.log(`Chat ${chatId} deleted`);
		} catch (error) {
			console.error('Error deleting chat:', error);
		}
	};

	useEffect(() => {
		if (userDetails.email) {
			getChats();
		}
	}, [userDetails]);

	return (
		<main>
			<SideBar />
			<div className="main-app">
				{chatID ? (
					<>
						<button
							onClick={() => {
								setChatID(null);
								setChatSystem(null);
								setDiagnosis([]);
								getChats();
							}}
							className="back-btn"
						>
							Back
						</button>
						<div>
							<section className="chat-section">
								<div className="chat" ref={messagesDiv}>
									{chats && chats.length
										? chats.map((chat, index) => (
											<div
												key={index}
												className={
													chat.role === 'user' ? 'user_msg' : 'bot_msg'
												}
											>
												{chat.role === 'user' ? (
													<span>{chat.content.split('"""')[1]}</span>
												) : (
													<span>{JSON.parse(chat.content).message}</span>
												)}
											</div>
										))
										: ''}
									{isTyping && chats && chats.length ? (
										<p className="bot_msg">
											<i>Bot is typing...</i>
										</p>
									) : (
										''
									)}
									{diagnosis.length ? (
										<div className="bot_msg">
											<h2>Possible conditions</h2>
											{diagnosis.map((item, index) => (
												<div key={index}>
													<h3>
														{index + 1}. {item.disease_name}
													</h3>
													<p>Recommend action: {item.course_of_action}</p>
													<a href={item.searchResult} target="_blank">
														Read more
													</a>
												</div>
											))}
										</div>
									) : (
										''
										//console.log('No diagnosis available') || null
									)}
								</div>
								{diagnosis.length ? (
									<span style={{ fontSize: '20px', color: 'white', alignSelf: 'center' }}>
										--Diagnosis has been provided, please create a new conversation--
									</span>
								) : (
									<form action="" onSubmit={(e) => chat(e, message)}>
										<input
											type="text"
											name="message"
											value={message}
											placeholder="Type your message"
											onChange={(e) => setMessage(e.target.value)}
										/>
										<button onClick={(e) => chat(e, message)}>
											<span className="material-symbols-outlined">send</span>
										</button>
									</form>
								)}
							</section>
						</div>
					</>
				) : (
					<section className="convo-div">
						<div className="intro">
							<h2>Welcome {userDetails.name?.split(' ')[0]},</h2>
							<div className="button-flex">
								<button onClick={() => createConversation('first')}>
									<span className="icon">
										<img src="/assets/plus.svg" />
									</span>{' '}
									<span className="text">
										Create a new Conversation
									</span>
								</button>
							</div>
						</div>
						<div className="actions">
							<div className="history">
								<h3>Diagnosis history</h3>
								{chatsState.loading ? (
									<p>
										<i>Loading...</i>
									</p>
								) : chatsState.data &&
									chatsState.data.filter((item) => item.diagnosis != null)
										.length ? (
									chatsState.data.map((item, index) =>
										item.diagnosis === null ? (
											''
										) : (

											<div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
												<button
													key={index}
													onClick={() =>
														loadConversation(item.chat_id, item.diagnosis)
													}
												>
													{item.chat_name || "No Diagnosis"} –{" "}
													{new Date(item.date_created).toLocaleDateString('en-US', {
														month: 'short',
														day: 'numeric',
														year: 'numeric'
													})}
												</button>
												<button
													onClick={() => handleDelete(item.chat_id)}
													style={{
														backgroundColor: 'red',
														color: 'white',
														border: 'none',
														padding: '4px 8px',
														cursor: 'pointer',
														borderRadius: '4px',
													}}
												>
													Delete
												</button>
											</div>
										)
									)
								) : (
									<p>No previous chats found</p>
								)}
							</div>
						</div>
					</section>
				)}
			</div>
		</main>
	);
};

export default MainApp;
