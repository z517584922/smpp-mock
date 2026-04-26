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
  session.on('state', (state: string) => {
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
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`发送绑定响应失败 [${sessionId}]: ${err.message}`);
      }
    } else {
      logger.warn(`绑定失败 [${sessionId}]: 认证信息不匹配`);
      try {
        session.send(pdu.response({ command_status: 0x0d }));
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`发送绑定失败响应失败 [${sessionId}]: ${err.message}`);
      }
    }
  });

  // 处理提交短信请求
  session.on('submit_sm', (pdu: PDU) => {
    if (!isBound) {
      logger.warn(`收到短信提交请求 [${sessionId}]，但会话未绑定`);
      return;
    }

    const { source_addr, destination_addr } = pdu;
    
    // 确保正确处理 short_message，只保留ASCII安全字符
    let shortMessageStr = '';
    if (pdu.short_message) {
      if (pdu.short_message instanceof Buffer) {
        shortMessageStr = pdu.short_message.toString('utf8');
      } else if (typeof pdu.short_message === 'object') {
        try {
          shortMessageStr = JSON.stringify(pdu.short_message);
        } catch (e) {
          shortMessageStr = String(pdu.short_message);
        }
      } else {
        shortMessageStr = String(pdu.short_message);
      }
    }
    
    // 生成唯一的消息ID（时间戳+随机数）
    const message_id = Date.now().toString() + Math.floor(Math.random() * 1000);
    
    logger.info(
      `收到短信提交 [${sessionId}]: from=${source_addr}, to=${destination_addr}, content="${shortMessageStr}"`
    );

    try {
      // 1. 先正常响应 submit_sm
      const submitSmResp = new PDU('submit_sm_resp', {
        sequence_number: pdu.sequence_number,
        command_status: 0,
        message_id  // 使用安全的消息ID
      });
      session.send(submitSmResp);
      logger.info(`短信提交成功 [${sessionId}]: from=${source_addr}, to=${destination_addr}, message_id=${message_id}`);

      // 2. 延迟1秒后，主动推送 deliver_sm 状态报告
      setTimeout(() => {
        try {
          const now = new Date();
          const submitDate = now.toISOString().replace(/[-T:]/g, '').substring(0, 12);
          const doneDate = new Date(now.getTime() + 1000).toISOString().replace(/[-T:]/g, '').substring(0, 12);
          
          // 使用安全的ASCII字符创建状态报告
          const statusReportText = `id:${message_id} sub:001 dlvrd:001 submit date:${submitDate} done date:${doneDate} stat:DELIVRD err:000 text:${shortMessageStr.substring(0, 20)}`;
          
          try {
            const statusReport = Buffer.from(statusReportText, 'ascii');
            
            const deliverSmPdu = new PDU('deliver_sm', {
              esm_class: 4, // 4 = SMC Delivery Receipt
              source_addr: destination_addr,
              destination_addr: source_addr,
              short_message: statusReport,
              receipted_message_id: message_id,
              message_state: 'DELIVERED'
            });

            session.send(deliverSmPdu);
            logger.info(`状态报告已发送 [${sessionId}]: message_id=${message_id}, status=DELIVRD`);
          } catch (bufferError: unknown) {
            const err = bufferError as Error;
            logger.error(`创建状态报告 Buffer 失败 [${sessionId}]: ${err.message}, 尝试使用安全编码`);
            
            // 如果创建 Buffer 失败，使用 base64 编码
            const safeStatusReport = Buffer.from(statusReportText.replace(/[^\x00-\x7F]/g, "?"), 'ascii');
            
            const deliverSmPdu = new PDU('deliver_sm', {
              esm_class: 4,
              source_addr: destination_addr,
              destination_addr: source_addr,
              short_message: safeStatusReport,
              receipted_message_id: message_id,
              message_state: 'DELIVERED'
            });

            session.send(deliverSmPdu);
            logger.info(`状态报告（安全模式）已发送 [${sessionId}]: message_id=${message_id}, status=DELIVRD`);
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error(`发送状态报告失败 [${sessionId}]: ${err.message}`);
        }
      }, 1000);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`发送短信响应失败 [${sessionId}]: ${err.message}`);
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
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`发送查询响应失败 [${sessionId}]: ${err.message}`);
    }
  });

  // 处理解绑请求
  session.on('unbind', (pdu: PDU) => {
    logger.info(`收到解绑请求 [${sessionId}]`);
    try {
      session.send(pdu.response());
      isBound = false;
      logger.info(`解绑成功 [${sessionId}]`);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`发送解绑响应失败 [${sessionId}]: ${err.message}`);
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