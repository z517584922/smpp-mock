import { Session } from 'smpp';
import { Socket } from 'net';
import * as dotenv from 'dotenv';

dotenv.config();

const host = '127.0.0.1';  // 本地服务器IP
const port = 2775;         // SMPP端口

// 创建 Socket 连接·
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

  const system_id = 'mock_smpp';
  const password = 'password';

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
    
    // 发送测试短信 - 直接使用字符串作为 short_message
    const messageContent = '你好';
    console.log('发送短信内容:', messageContent);
    
    session.submit_sm({
      source_addr: '10086',
      destination_addr: '13800138000',
      short_message: messageContent  // 直接使用字符串
    });
  } else {
    console.error('绑定失败:', pdu.command_status);
  }
});

// 短信提交响应处理
session.on('submit_sm_resp', (pdu) => {
  if (pdu.command_status === 0) {
    let message_id = pdu.message_id;
    if (message_id && typeof message_id === 'object') {
      message_id = JSON.stringify(message_id);
    }
    console.log('短信发送成功，消息ID:', message_id);
  } else {
    console.error('短信发送失败:', pdu.command_status);
  }
});

// 处理状态报告
session.on('deliver_sm', (pdu) => {
  console.log('收到状态报告:');
  
  let receipted_message_id = pdu.receipted_message_id;
  if (receipted_message_id && typeof receipted_message_id === 'object') {
    receipted_message_id = JSON.stringify(receipted_message_id);
  }
  console.log('消息ID:', receipted_message_id);
  
  console.log('状态:', pdu.message_state);
  
  if (pdu.short_message) {
    let statusReport;
    if (pdu.short_message instanceof Buffer) {
      statusReport = pdu.short_message.toString('utf8');
    } else if (typeof pdu.short_message === 'object') {
      statusReport = JSON.stringify(pdu.short_message);
    } else {
      statusReport = String(pdu.short_message);
    }
    console.log('状态报告内容:', statusReport);
  } else {
    console.log('状态报告内容: 无');
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