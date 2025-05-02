import { createServer } from 'net';
import { Session, PDU } from 'smpp';
import { createLogger, format, transports } from 'winston';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建日志记录器
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    }),
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: process.env.LOG_FILE_PATH || 'logs/smpp-mock.log',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
    }),
  ],
});

// 创建 SMPP 服务器
const server = createServer((socket) => {
  const sessionId = `${socket.remoteAddress}:${socket.remotePort}`;
  logger.debug(`新的连接建立: ${sessionId}`);
  
  // 设置 socket 选项
  socket.setKeepAlive(true, 1000); // 每秒发送一次 keepalive
  socket.setTimeout(0); // 禁用超时
  
  const session = new Session({ 
    socket,
    inactivityTimeout: 0,    // 禁用不活动超时
    keepAlive: true,         // 启用保活
    reconnectTimer: 1000,    // 断开后1秒尝试重连
    connectTimeout: 10000,   // 连接超时时间10秒
  });
  let isBound = false;

  // 记录会话状态变化
  session.on('state', (state) => {
    logger.debug(`会话状态变化 [${sessionId}]: ${state}`);
  });

  // 处理绑定请求
  session.on('bind_transceiver', (pdu: PDU) => {
    const { system_id, password } = pdu;
    logger.info(`收到绑定请求 [${sessionId}]: system_id=${system_id}, password=${password}`);

    if (!system_id || !password) {
      logger.warn(`绑定失败 [${sessionId}]: system_id 或 password 为空`);
      session.send(pdu.response({ command_status: 0x0d }));
      return;
    }

    if (
      system_id === process.env.SMPP_SYSTEM_ID &&
      password === process.env.SMPP_PASSWORD
    ) {
      try {
        session.send(pdu.response());
        isBound = true;
        logger.info(`绑定成功 [${sessionId}]: system_id=${system_id}`);
      } catch (error) {
        logger.error(`发送绑定响应失败 [${sessionId}]: ${error.message}`);
      }
    } else {
      logger.warn(`绑定失败 [${sessionId}]: 认证信息不匹配`);
      try {
        session.send(pdu.response({ command_status: 0x0d }));
      } catch (error) {
        logger.error(`发送绑定失败响应失败 [${sessionId}]: ${error.message}`);
      }
    }
  });

  // 处理提交短信请求
  session.on('submit_sm', (pdu: PDU) => {
    if (!isBound) {
      logger.warn(`收到短信提交请求 [${sessionId}]，但会话未绑定`);
      return;
    }

    const { source_addr, destination_addr, short_message } = pdu;
    logger.info(
      `收到短信提交 [${sessionId}]: from=${source_addr}, to=${destination_addr}, message=${short_message}`,
    );

    try {
      session.send(pdu.response({
        message_id: Date.now().toString()
      }));
      logger.info(`短信提交成功 [${sessionId}]: from=${source_addr}, to=${destination_addr}`);
    } catch (error) {
      logger.error(`发送短信响应失败 [${sessionId}]: ${error.message}`);
    }
  });

  // 处理查询请求
  session.on('enquire_link', (pdu: PDU) => {
    if (!isBound) {
      logger.warn(`收到查询请求 [${sessionId}]，但会话未绑定`);
      return;
    }

    logger.debug(`收到查询请求 [${sessionId}]`);
    try {
      const response = pdu.response({
        command_status: 0x00000000  // ESME_ROK
      });
      
      session.send(response);
      logger.debug(`查询响应已发送 [${sessionId}]: sequence_number=${pdu.sequence_number}`);
    } catch (error) {
      logger.error(`发送查询响应失败 [${sessionId}]: ${error.message}`);
    }
  });

  // 处理解绑请求
  session.on('unbind', (pdu: PDU) => {
    logger.info(`收到解绑请求 [${sessionId}]`);
    try {
      session.send(pdu.response());
      isBound = false;
      logger.info(`解绑成功 [${sessionId}]`);
    } catch (error) {
      logger.error(`发送解绑响应失败 [${sessionId}]: ${error.message}`);
    }
  });

  // 处理错误
  session.on('error', (error: Error) => {
    logger.error(`会话错误 [${sessionId}]: ${error.message}`);
    logger.error(`错误堆栈: ${error.stack}`);
    isBound = false;
  });

  // 处理关闭
  session.on('close', () => {
    logger.info(`会话关闭 [${sessionId}]`);
    isBound = false;
  });

  // 监听 socket 事件
  socket.on('error', (error) => {
    logger.error(`Socket错误 [${sessionId}]: ${error.message}`);
  });

  socket.on('timeout', () => {
    logger.warn(`Socket超时 [${sessionId}]`);
  });

  socket.on('end', () => {
    logger.info(`Socket结束 [${sessionId}]`);
  });
});

// 启动服务器
const port = parseInt(process.env.SMPP_PORT || '2775');
const host = process.env.SMPP_HOST || '0.0.0.0';

server.listen(port, host, () => {
  logger.info(`SMPP 模拟服务器已启动: ${host}:${port}`);
  logger.info(`配置信息: system_id=${process.env.SMPP_SYSTEM_ID}, password=${process.env.SMPP_PASSWORD}`);
});

// 处理进程退出
process.on('SIGINT', () => {
  logger.info('正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
}); 