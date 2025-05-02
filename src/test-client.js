"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var smpp_1 = require("smpp");
var dotenv = require("dotenv");
var net_1 = require("net");
dotenv.config();
var host = process.env.SMPP_HOST || 'localhost';
var port = parseInt(process.env.SMPP_PORT || '2775');
console.log("\u6B63\u5728\u8FDE\u63A5\u5230 SMPP \u670D\u52A1\u5668: ".concat(host, ":").concat(port));
// 创建 Socket 连接
var socket = new net_1.Socket();
// 创建 SMPP 会话
var session = new smpp_1.Session({ socket: socket });
// 连接到服务器
socket.connect({ host: host, port: port }, function () {
    console.log('已连接到 SMPP 服务器');
    var system_id = process.env.SMPP_SYSTEM_ID || 'mock_smpp';
    var password = process.env.SMPP_PASSWORD || 'password';
    console.log("\u6B63\u5728\u7ED1\u5B9A\uFF0Csystem_id: ".concat(system_id));
    session.bind_transceiver({
        system_id: system_id,
        password: password,
    });
});
// 绑定响应处理
session.on('bind_transceiver_resp', function (pdu) {
    console.log('绑定成功，开始发送短信');
    // 发送测试短信
    var message = '这是一条测试短信';
    console.log("\u6B63\u5728\u53D1\u9001\u77ED\u4FE1: ".concat(message));
    session.submit_sm({
        source_addr: '10086',
        destination_addr: '13800138000',
        short_message: Buffer.from(message).toString('hex'),
        registered_delivery: 1,
    });
    // 设置定期发送 enquire_link
    setInterval(function () {
        console.log('发送 enquire_link 消息');
        session.enquire_link();
    }, 10000); // 每10秒发送一次
});
// enquire_link 响应处理
session.on('enquire_link_resp', function (pdu) {
    console.log("\u6536\u5230 enquire_link \u54CD\u5E94: sequence_number=".concat(pdu.sequence_number, ", command_status=").concat(pdu.command_status));
});
// 短信发送响应处理
session.on('submit_sm_resp', function (pdu) {
    console.log('短信发送成功，消息ID:', pdu.message_id);
    // 关闭连接
    setTimeout(function () {
        console.log('正在解绑连接...');
        session.unbind();
    }, 30000); // 延长等待时间到30秒，以便测试 enquire_link
});
// 解绑响应处理
session.on('unbind_resp', function () {
    console.log('已解绑连接');
    process.exit(0);
});
// 错误处理
session.on('error', function (error) {
    console.error('发生错误:', error);
    process.exit(1);
});
// 连接关闭处理
session.on('close', function () {
    console.log('连接已关闭');
    process.exit(0);
});
