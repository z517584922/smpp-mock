import { Session } from 'smpp';
import * as dotenv from 'dotenv';
import { Socket } from 'net';

dotenv.config();

const host = process.env.SMPP_HOST || 'localhost';
const port = parseInt(process.env.SMPP_PORT || '2775');

console.log(`正在连接到 SMPP 服务器: ${host}:${port}`);

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

// 连接到服务器
socket.connect({ host, port }, () => {
  console.log('已连接到 SMPP 服务器');

  const system_id = process.env.SMPP_SYSTEM_ID || 'mock_smpp';
  const password = process.env.SMPP_PASSWORD || 'password';
  
  console.log(`正在绑定，system_id: ${system_id}`);
  
  session.bind_transceiver({
    system_id,
    password,
  });
});

// 绑定响应处理
session.on('bind_transceiver_resp', (pdu: any) => {
  console.log('绑定成功，开始发送短信');

  // 发送测试短信
  const message = '这是一条测试短信';
  console.log(`正在发送短信: ${message}`);
  
  session.submit_sm({
    source_addr: '10086',
    destination_addr: '13800138000',
    short_message: Buffer.from(message).toString('hex'),
    registered_delivery: 1,
  });

  // 设置定期发送 enquire_link
  setInterval(() => {
    console.log('发送 enquire_link 消息');
    session.enquire_link();
  }, 2000); // 每2秒发送一次
});

// enquire_link 响应处理
session.on('enquire_link_resp', (pdu: any) => {
  console.log(`收到 enquire_link 响应: sequence_number=${pdu.sequence_number}, command_status=${pdu.command_status}`);
});

// 短信发送响应处理
session.on('submit_sm_resp', (pdu: any) => {
  console.log('短信发送成功，消息ID:', pdu.message_id);
});

// 解绑响应处理
session.on('unbind_resp', () => {
  console.log('已解绑连接');
});

// 错误处理
session.on('error', (error: Error) => {
  console.error('发生错误:', error);
});

// 连接关闭处理
session.on('close', () => {
  console.log('连接已关闭');
  // 尝试重新连接
  setTimeout(() => {
    console.log('尝试重新连接...');
    socket.connect({ host, port });
  }, 1000);
}); 