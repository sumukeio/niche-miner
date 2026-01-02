# 代理IP和移动端访问功能说明

## 📋 功能概述

现在工具支持两个重要功能：
1. **代理IP支持**：可以换IP模拟访问，避免IP被封
2. **移动端模式**：模拟手机访问，因为很多同行的广告只在手机端投放

---

## 🌐 代理IP使用

### 方式1：单个代理IP

使用 `--proxy` 或 `-p` 参数指定单个代理：

```bash
# HTTP 代理
python baidu_ad_validator.py --proxy http://proxy.example.com:8080

# SOCKS5 代理
python baidu_ad_validator.py --proxy socks5://proxy.example.com:1080

# 简化格式（会自动添加 http:// 前缀）
python baidu_ad_validator.py --proxy 192.168.1.100:8080
```

### 方式2：代理列表（自动轮换）

使用 `--proxy-list` 或 `-pl` 参数指定代理列表文件：

```bash
python baidu_ad_validator.py --proxy-list proxies.txt
```

**代理列表文件格式** (`proxies.txt`)：

```
# 每行一个代理地址
# 支持注释（以 # 开头）
http://proxy1.example.com:8080
http://proxy2.example.com:8080
socks5://proxy3.example.com:1080
192.168.1.100:8080
192.168.1.101:8080
```

**工作方式**：
- 程序会按顺序使用列表中的代理
- 每个关键词会自动切换到下一个代理
- 到达列表末尾后，会重新从开头开始（循环使用）

### 代理优先级

1. **代理列表** (`--proxy-list`) - 优先使用
2. **单个代理** (`--proxy`) - 次选
3. **不使用代理** - 如果都不指定

---

## 📱 移动端模式

使用 `--mobile` 或 `-m` 参数启用移动端模式：

```bash
# 移动端模式
python baidu_ad_validator.py --mobile

# 移动端 + 代理
python baidu_ad_validator.py --mobile --proxy http://proxy.example.com:8080

# 移动端 + 代理列表
python baidu_ad_validator.py --mobile --proxy-list proxies.txt
```

### 移动端模式特性

- ✅ **移动端 User-Agent**：使用 iPhone Safari 的 User-Agent
- ✅ **移动端视口**：390x844（iPhone 14 Pro 尺寸）
- ✅ **移动端URL**：自动使用 `m.baidu.com`（移动端百度）
- ✅ **触摸支持**：模拟触摸设备
- ✅ **高DPI显示**：设备像素比 3（Retina 显示屏）

### 为什么需要移动端模式？

很多商家只在**移动端投放广告**，PC端搜索可能看不到广告，但移动端能看到。使用移动端模式可以：
- 发现更多广告（移动端专属广告）
- 更准确地评估关键词的商业价值
- 获取更完整的竞争分析数据

---

## 🎯 完整使用示例

### 示例1：移动端 + 代理列表

```bash
python baidu_ad_validator.py \
  --mobile \
  --proxy-list proxies.txt \
  --input keywords.xlsx \
  --output mobile_results.xlsx
```

### 示例2：PC端 + 单个代理

```bash
python baidu_ad_validator.py \
  --proxy http://192.168.1.100:8080 \
  --input keywords.xlsx \
  --output pc_results.xlsx
```

### 示例3：移动端 + 单个代理 + 无头模式

```bash
python baidu_ad_validator.py \
  --mobile \
  --proxy socks5://proxy.example.com:1080 \
  --headless \
  --input keywords.xlsx
```

---

## 📝 代理IP获取建议

### 免费代理来源

1. **免费代理网站**：如 proxylist.geonode.com、free-proxy-list.net
2. **代理池服务**：一些开源项目提供免费代理池

### 付费代理服务

1. **国内代理服务商**：阿布云、快代理、代理云等
2. **国际代理服务商**：Bright Data、Oxylabs、Smartproxy 等

### 代理格式要求

支持的代理格式：
- `http://host:port`
- `https://host:port`
- `socks5://host:port`
- `host:port`（会自动添加 `http://` 前缀）

---

## ⚠️ 注意事项

### 代理相关

1. **代理质量**：建议使用高质量代理，避免频繁失败
2. **代理速度**：代理速度会影响整体运行速度
3. **代理稳定性**：不稳定的代理可能导致请求失败
4. **代理费用**：如果是付费代理，注意控制使用量

### 移动端相关

1. **页面结构不同**：移动端百度页面结构与PC端不同，广告检测逻辑已适配
2. **截图尺寸**：移动端截图尺寸为 390x844
3. **广告数量**：移动端可能显示更多或更少的广告
4. **建议策略**：可以PC端和移动端都测试，对比结果

### 最佳实践

1. **先测试PC端，再测试移动端**：对比两种模式的结果
2. **使用代理列表**：避免单个代理失败导致全部中断
3. **控制请求频率**：即使使用代理，也要控制请求频率
4. **监控代理状态**：观察日志，确保代理正常工作

---

## 🔍 日志示例

启用代理和移动端后，日志会显示：

```
2025-12-24 10:00:00 - INFO - ============================================================
2025-12-24 10:00:00 - INFO - 百度竞价关键词商业价值验证工具
2025-12-24 10:00:00 - INFO - ============================================================
2025-12-24 10:00:00 - INFO - 使用移动端模式（模拟手机访问）
2025-12-24 10:00:00 - INFO - 使用代理: 5个代理轮换
2025-12-24 10:00:00 - INFO - 成功加载 100 个关键词
2025-12-24 10:00:00 - INFO - 开始验证 100 个关键词...
2025-12-24 10:00:05 - INFO - 使用代理: http://proxy1.example.com:8080 (索引: 0/5)
2025-12-24 10:00:10 - INFO - [1/100] 搜索: 野生黄芪多少钱
2025-12-24 10:00:15 - INFO - [1/100] ✓ 野生黄芪多少钱 -> 发现广告！（2个）
```

---

## 🛠️ 故障排除

### 代理连接失败

**问题**：日志显示代理连接失败

**解决方案**：
1. 检查代理地址和端口是否正确
2. 检查代理是否需要认证（当前版本不支持认证）
3. 尝试使用其他代理
4. 检查网络连接

### 移动端检测不到广告

**问题**：移动端模式下检测不到广告

**解决方案**：
1. 检查关键词是否真的在移动端有广告（手动用手机搜索验证）
2. 检查页面是否正常加载（查看截图）
3. 尝试增加等待时间
4. 对比PC端和移动端的结果

### 代理速度慢

**问题**：使用代理后速度明显变慢

**解决方案**：
1. 更换更快的代理
2. 减少关键词数量，分批处理
3. 使用本地代理（如本地VPN）
4. 优化代理配置

---

## 📊 对比建议

建议同时运行PC端和移动端，对比结果：

```bash
# 运行PC端
python baidu_ad_validator.py -i keywords.xlsx -o pc_results.xlsx

# 运行移动端
python baidu_ad_validator.py -m -i keywords.xlsx -o mobile_results.xlsx
```

然后对比两个结果文件，找出：
- PC端有广告但移动端没有的关键词
- 移动端有广告但PC端没有的关键词（这种情况很常见）
- 两端都有广告的关键词（商业价值最高）

---

**最后更新**: 2024-12-24




