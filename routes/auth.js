const express = require('express');
const router = express.Router();
const moment = require('moment');
const User = require('../models/userModel');
// 格式验证插件
const {
	check,
	validationResult
} = require('express-validator');
// 加密插件
const bcrypt = require('bcryptjs');
// token插件
const jwt = require('jsonwebtoken');

// 注册接口
// 后期要处理下用户级别可以随便传的问题
router.post('/signup',
	[
		check('userName', '用户名格式错误！')
		.not()
		.isEmpty(),
		check('passWord', '用户密码格式错误！').isLength({
			min: 32,
			max: 32
		}),
		check('email', '邮箱格式错误！').isEmail(),
		check('phone', '手机号格式错误').isMobilePhone()
	],
	async (req, res) => {
		const error = validationResult(req);
		if (!error.isEmpty()) {
			return res.json({
				status: 400,
				msg: '注册失败！',
				error: error.array()
			});
		};

		const {
			userName,
			passWord,
			email,
			phone,
			level,
			createDate,
			updateDate,
			lastLoginDate
		} = req.body;

		try {
			// 匹配用户名，邮箱，手机号，是否有注册过
			let userByName = await User.findOne({
				userName
			});
			let userByEmail = await User.findOne({
				email
			});
			let userByPhone = await User.findOne({
				phone
			});
			if (userByName) {
				return res.json({
					status: 400,
					msg: '用户名已注册！'
				});
			};
			if (userByEmail) {
				return res.json({
					status: 400,
					msg: '邮箱已注册！'
				});
			};
			if (userByPhone) {
				return res.json({
					status: 400,
					msg: '手机号已注册！'
				});
			};

			// 开始注册
			let user = new User({
				userName,
				passWord,
				email,
				phone,
				level,
				createDate,
				updateDate,
				lastLoginDate
			});

			// 加盐就是系统生成一串随机值，混入原始密码中，然后按照加密方式生成一串字符串保存在服务器
			const salt = await bcrypt.genSalt(10);

			// 用户的密码经过加密后存储在服务器
			user.passWord = await bcrypt.hash(passWord, salt);
			await user.save();

			// 用户id当做签参数
			const payload = {
				user: {
					id: user.id
				}
			};

			// 签发token，注册默认签发一个24小时有效的token，目前的页面逻辑没有用到
			jwt.sign(
				payload,
				'randomString', {
					// 默认24小时后过期
					expiresIn: 60 * 60 * 24
				},
				(err, token) => {
					if (err) {
						throw err;
					};
					res.status(200).json({
						status: 0,
						msg: '注册成功！',
						token: token
					});
				}
			);
		} catch (error) {
			res.json({
				status: 500,
				msg: '注册服务异常！',
				error: error.message
			});
		};
	}
);


// 登录接口
router.post('/login',
	// 登录暂时不需要用户名和密码的格式验证吧？
	[
		check('userName', '用户名格式错误！')
		.not()
		.isEmpty(),
		check('passWord', '用户密码格式错误！').isLength({
			min: 32,
			max: 32
		}),
		check('validityTime', '登录有效期不能为空！')
		.notEmpty()
	], async (req, res) => {
		// 登录暂时不需要用户名和密码的格式验证吧？
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.json({
				status: 400,
				msg: '登录失败！',
				error: errors.array()
			});
		};

		const {
			userName,
			passWord,
			validityTime
		} = req.body;

		try {
			// 匹配用户
			const user = await User.findOne({
				userName
			});
			if (!user) {
				return res.json({
					status: 400,
					msg: '用户不存在！'
				});
			}

			// 匹配密码
			const isMatch = await bcrypt.compare(passWord, user.passWord);
			if (!isMatch) {
				return res.json({
					status: 400,
					msg: '用户密码错误！'
				});
			};

			// 匹配有效期，必须要是秒数字
			if (!(new RegExp('^[1-9]\d*|0$').test(validityTime))) {
				return res.json({
					status: 400,
					msg: '登录有效期格式错误！'
				});
			};

			// 查找上一次登录时间信息，并计算时间差
			let lastLoginDate, nowLoginDate, loginTimeGap;
			let testPromise = new Promise(function(resolve, reject) {
				User.findOne({
					userName: userName
				}, function(err, doc) {
					if (err) {
						// 返回异常
						reject(err);
					};
					if (doc) {
						// 上次登录时间和当前时间对比，并得出时间差
						lastLoginDate = doc.lastLoginDate;
						nowLoginDate = Date.now();
						loginTimeGap = moment(nowLoginDate).diff(moment(lastLoginDate),
							'seconds');

						// 返回给下一步操作
						resolve(nowLoginDate);
					};
				});
			});

			// 修改最后的登录时间，成功后签发token
			testPromise.then(function(date) {
				User.findOneAndUpdate({
					userName: userName
				}, {
					lastLoginDate: nowLoginDate
				}, function(err, doc) {
					if (err) {
						throw (err);
					};
					if (doc) {

						// 准备签发参数
						const payload = {
							user: {
								id: user.id
							}
						};

						// 签发token
						jwt.sign(
							payload,
							'randomString', {
								expiresIn: validityTime
							},
							(err, token) => {
								if (err) {
									throw err
								};
								res.status(200).json({
									status: 0,
									msg: '登录成功！',
									data: {
										userName: user.userName,
										loginTimeGap: loginTimeGap
									},
									token: token
								});
							}
						);
					};
				});
			});

		} catch (error) {
			res.json({
				status: 500,
				msg: '登录服务异常！',
				error: error.message
			});
		};
		
	}
);

module.exports = router;
