"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var net_1 = require("net");
var smpp_1 = require("smpp");
var winston_1 = require("winston");
var dotenv = require("dotenv");
// 加载环境变量
dotenv.config();
// 创建日志记录器
var logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.colorize(), winston_1.format.printf(function (_a) {
        var timestamp = _a.timestamp, level = _a.level, message = _a.message;
        return "".concat(timestamp, " ").concat(level, ": ").concat(message);
    })),
    transports: [
        new winston_1.transports.Console(),
        new winston_1.transports.File({
            filename: process.env.LOG_FILE_PATH || 'logs/smpp-mock.log',
            maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '10485760'),
            maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
        }),
    ],
});
// 创建 SMPP 服务器
var server = (0, net_1.createServer)(function (socket) {
    var session = new smpp_1.Session({ socket: socket });
    // 处理绑定请求
    session.on('bind_transceiver', function (pdu) {
        var system_id = pdu.system_id, password = pdu.password;
        logger.info("\u6536\u5230\u7ED1\u5B9A\u8BF7\u6C42: system_id=".concat(system_id, ", password=").concat(password));
        logger.info("\u671F\u671B\u7684\u8BA4\u8BC1\u4FE1\u606F: system_id=".concat(process.env.SMPP_SYSTEM_ID, ", password=").concat(process.env.SMPP_PASSWORD));
        if (!system_id || !password) {
            logger.warn("\u7ED1\u5B9A\u5931\u8D25: system_id \u6216 password \u4E3A\u7A7A");
            session.send(pdu.response({ command_status: 0x0d }));
            return;
        }
        if (system_id === process.env.SMPP_SYSTEM_ID &&
            password === process.env.SMPP_PASSWORD) {
            session.send(pdu.response());
            logger.info("\u7ED1\u5B9A\u6210\u529F: system_id=".concat(system_id));
        }
        else {
            logger.warn("\u7ED1\u5B9A\u5931\u8D25: \u8BA4\u8BC1\u4FE1\u606F\u4E0D\u5339\u914D\n        \u63A5\u6536\u5230\u7684: system_id=".concat(system_id, ", password=").concat(password, "\n        \u671F\u671B\u7684: system_id=").concat(process.env.SMPP_SYSTEM_ID, ", password=").concat(process.env.SMPP_PASSWORD));
            session.send(pdu.response({ command_status: 0x0d }));
        }
    });
    // 处理提交短信请求
    session.on('submit_sm', function (pdu) {
        var source_addr = pdu.source_addr, destination_addr = pdu.destination_addr, short_message = pdu.short_message;
        logger.info("\u6536\u5230\u77ED\u4FE1\u63D0\u4EA4: from=".concat(source_addr, ", to=").concat(destination_addr, ", message=").concat(short_message));
        // 模拟处理延迟
        setTimeout(function () {
            session.send(pdu.response());
            logger.info("\u77ED\u4FE1\u63D0\u4EA4\u6210\u529F: from=".concat(source_addr, ", to=").concat(destination_addr));
        }, 100);
    });
    // 处理查询请求
    session.on('enquire_link', function (pdu) {
        session.send(pdu.response());
        logger.debug('收到并响应查询请求');
    });
    // 处理错误
    session.on('error', function (error) {
        logger.error("\u4F1A\u8BDD\u9519\u8BEF: ".concat(error.message));
    });
    // 处理关闭
    session.on('close', function () {
        logger.info('会话关闭');
    });
});
// 启动服务器
var port = parseInt(process.env.SMPP_PORT || '2775');
var host = process.env.SMPP_HOST || '0.0.0.0';
server.listen(port, host, function () {
    logger.info("SMPP \u6A21\u62DF\u670D\u52A1\u5668\u5DF2\u542F\u52A8: ".concat(host, ":").concat(port));
    logger.info("\u914D\u7F6E\u4FE1\u606F: system_id=".concat(process.env.SMPP_SYSTEM_ID, ", password=").concat(process.env.SMPP_PASSWORD));
});
// 处理进程退出
process.on('SIGINT', function () {
    logger.info('正在关闭服务器...');
    server.close(function () {
        logger.info('服务器已关闭');
        process.exit(0);
    });
});
