import { Session } from 'smpp';
import { Socket } from 'net';
import * as dotenv from 'dotenv';

dotenv.config();

const host = process.env.SMPP_HOST || 'localhost';
const port = parseInt(process.env.SMPP_PORT || '2775');

// 创建 Socket 连接
const socket = new Socket();

// 创建 SMPP 会话
const session = new Session({ 
  socket,
  inactivityTimeout: 0,    // 禁用不活动超时
  keepAlive: true,         // 启用保活
  enquireLinkTimer: 2000,  // 每2秒发送一次 enquire_link
  reconnectTimer: 1000,    // 断开后1秒尝试重连
  connectTimeout: 10000,   // 连接超时时间10秒
});

session.on('state', (state: string) => {
  console.log('Session state:', state);
});

session.on('error', (error: Error) => {
  console.error('Session error:', error);
});

// 连接到服务器
socket.connect({ host, port }, () => {
  console.log('已连接到 SMPP 服务器');

  const system_id = process.env.SMPP_SYSTEM_ID || 'mock_smpp';
  const password = process.env.SMPP_PASSWORD || 'password';

  // 发送绑定请求
  session.bind_transceiver({
    system_id,
    password,
  });
});

socket.on('error', (error: Error) => {
  console.error('Socket error:', error);
});

// 绑定响应处理
session.on('bind_transceiver_resp', (pdu) => {
  if (pdu.command_status === 0) {
    console.log('绑定成功');
    
    // 发送测试短信
    session.submit_sm({
      source_addr: '1234567890',
      destination_addr: '9876543210',
      short_message: 'Hello from SMPP mock!'
    });
  } else {
    console.error('绑定失败:', pdu.command_status);
  }
});

// 短信提交响应处理
session.on('submit_sm_resp', (pdu) => {
  if (pdu.command_status === 0) {
    console.log('短信发送成功，消息ID:', pdu.message_id);
  } else {
    console.error('短信发送失败:', pdu.command_status);
  }
});

// 定期发送查询请求
setInterval(() => {
  session.enquire_link();
}, 5000);

// 错误处理
session.on('error', (error: Error) => {
  console.error('发生错误:', error);
});

// 连接关闭处理
socket.on('close', () => {
  console.log('连接已关闭');
  setTimeout(() => {
    console.log('尝试重新连接...');
    socket.connect({ host, port });
  }, 1000);
}); 