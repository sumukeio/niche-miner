"""
淘宝关键词挖掘工具
通过种子词搜索淘宝，抓取符合销量范围的长尾商品标题，清洗后存入数据库
"""

import os
import sys
import json
import time
import random
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, TimeoutError as PlaywrightTimeoutError
from typing import List, Dict, Optional
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

# 设置标准输出和错误输出为 UTF-8 编码（解决 Windows 乱码问题）
if sys.platform == 'win32':
    try:
        # 设置标准输出编码为 UTF-8
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        # 如果不支持 reconfigure，使用环境变量
        os.environ['PYTHONIOENCODING'] = 'utf-8'

# 加载环境变量
load_dotenv()

# 配置日志（确保 UTF-8 编码）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
# 确保日志输出使用 UTF-8
for handler in logging.root.handlers:
    if isinstance(handler, logging.StreamHandler):
        if hasattr(handler.stream, 'reconfigure'):
            try:
                handler.stream.reconfigure(encoding='utf-8')
            except:
                pass

logger = logging.getLogger(__name__)


class TaobaoMiner:
    """淘宝关键词挖掘器"""
    
    # PC端 User-Agent 池（随机轮换，增强反爬）
    PC_USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ]
    
    def __init__(self, headless: bool = False, auth_file: str = "auth_taobao.json", 
                 supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        """
        初始化挖掘器
        
        Args:
            headless: 是否无头模式运行（False 表示显示浏览器窗口，登录时建议 False）
            auth_file: 认证文件路径（保存 Cookies）
            supabase_url: Supabase 项目 URL（从环境变量读取或手动指定）
            supabase_key: Supabase API Key（从环境变量读取或手动指定）
        """
        self.headless = headless
        self.auth_file = Path(auth_file)
        self.user_agent = random.choice(self.PC_USER_AGENTS)  # 随机选择 User-Agent
        self.viewport = {'width': 1920, 'height': 1080}
        
        # 初始化 Supabase 客户端
        self.supabase: Optional[Client] = None
        if supabase_url and supabase_key:
            try:
                self.supabase = create_client(supabase_url, supabase_key)
                logger.info("✅ Supabase 客户端已初始化")
            except Exception as e:
                logger.warning(f"⚠️ Supabase 初始化失败: {str(e)}")
        else:
            # 尝试从环境变量读取
            supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
            supabase_key = os.getenv('SUPABASE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
            if supabase_url and supabase_key:
                try:
                    self.supabase = create_client(supabase_url, supabase_key)
                    logger.info("✅ Supabase 客户端已初始化（从环境变量）")
                except Exception as e:
                    logger.warning(f"⚠️ Supabase 初始化失败: {str(e)}")
            else:
                logger.warning("⚠️ 未配置 Supabase，将只抓取数据不写入数据库")
        
        logger.info(f"初始化淘宝挖掘器 (User-Agent: {self.user_agent[:50]}...)")
    
    def wait_random(self, min_seconds: float = 2.0, max_seconds: float = 5.0):
        """
        随机等待，模拟真人操作
        
        Args:
            min_seconds: 最小等待时间（秒）
            max_seconds: 最大等待时间（秒）
        """
        wait_time = random.uniform(min_seconds, max_seconds)
        logger.debug(f"随机等待 {wait_time:.2f} 秒...")
        time.sleep(wait_time)
    
    def retry_with_backoff(self, func, max_retries: int = 3, base_delay: float = 1.0, 
                          backoff_factor: float = 2.0, *args, **kwargs):
        """
        带指数退避的重试机制
        
        Args:
            func: 要重试的函数
            max_retries: 最大重试次数（默认3次）
            base_delay: 基础延迟时间（秒）
            backoff_factor: 退避因子（默认2，即1s, 2s, 4s）
            *args, **kwargs: 传递给函数的参数
            
        Returns:
            函数执行结果
            
        Raises:
            最后一次尝试的异常
        """
        last_exception = None
        
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except (PlaywrightTimeoutError, Exception) as e:
                last_exception = e
                
                # 检查是否是可重试的错误
                error_str = str(e).lower()
                retriable_errors = [
                    'timeout',
                    'network',
                    'connection',
                    'navigation',
                    'page.goto',
                    'load state',
                ]
                
                is_retriable = any(keyword in error_str for keyword in retriable_errors)
                
                if not is_retriable:
                    # 不可重试的错误，直接抛出
                    logger.error(f"遇到不可重试的错误: {str(e)}")
                    raise
                
                if attempt < max_retries - 1:
                    # 计算延迟时间（指数退避）
                    delay = base_delay * (backoff_factor ** attempt)
                    logger.warning(f"⚠️ 网络错误（尝试 {attempt + 1}/{max_retries}）: {str(e)[:100]}")
                    logger.info(f"等待 {delay:.1f} 秒后重试...")
                    time.sleep(delay)
                else:
                    logger.error(f"❌ 重试 {max_retries} 次后仍然失败: {str(e)}")
        
        # 所有重试都失败，抛出最后一次的异常
        raise last_exception
    
    def save_cookies(self, page: Page) -> bool:
        """
        保存当前页面的 Cookies 到文件
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            是否保存成功
        """
        try:
            cookies = page.context.cookies()
            auth_data = {
                'cookies': cookies,
                'user_agent': self.user_agent,
                'saved_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            with open(self.auth_file, 'w', encoding='utf-8') as f:
                json.dump(auth_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"✅ Cookies 已保存到: {self.auth_file}")
            return True
        except Exception as e:
            logger.error(f"保存 Cookies 失败: {str(e)}")
            return False
    
    def load_cookies(self, page: Page) -> bool:
        """
        从文件加载 Cookies 到页面上下文
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            是否加载成功
        """
        if not self.auth_file.exists():
            logger.warning(f"认证文件不存在: {self.auth_file}")
            return False
        
        try:
            with open(self.auth_file, 'r', encoding='utf-8') as f:
                auth_data = json.load(f)
            
            cookies = auth_data.get('cookies', [])
            if not cookies:
                logger.warning("认证文件中没有 Cookies 数据")
                return False
            
            # 先访问淘宝首页，建立域名上下文
            page.goto('https://www.taobao.com', timeout=30000, wait_until='domcontentloaded')
            page.wait_for_timeout(1000)
            
            # 加载 Cookies
            page.context.add_cookies(cookies)
            
            # 如果有保存的 User-Agent，使用它
            saved_ua = auth_data.get('user_agent')
            if saved_ua:
                self.user_agent = saved_ua
                # 设置 User-Agent（通过 context 设置）
                page.set_extra_http_headers({'User-Agent': self.user_agent})
            
            logger.info(f"✅ Cookies 已加载 (保存时间: {auth_data.get('saved_at', '未知')})")
            return True
        except Exception as e:
            logger.error(f"加载 Cookies 失败: {str(e)}")
            return False
    
    def is_cookies_expired(self, page: Page) -> bool:
        """
        检查 Cookies 是否失效（通过检查是否被重定向到登录页）
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            True 表示 Cookies 已失效，False 表示正常
        """
        try:
            current_url = page.url
            # 检查是否被重定向到登录页
            login_url_patterns = [
                'login.taobao.com',
                'passport.taobao.com',
                '/member/login',
            ]
            
            for pattern in login_url_patterns:
                if pattern in current_url:
                    logger.warning(f"检测到登录页URL，Cookies可能已失效: {current_url}")
                    return True
            
            # 检查页面内容中是否包含登录提示
            try:
                page_content = page.content()
                login_indicators = [
                    '请登录',
                    '登录后',
                    '扫码登录',
                    '账号登录',
                ]
                # 检查页面标题或关键区域
                for indicator in login_indicators:
                    if indicator in page_content[:5000]:  # 只检查前5000字符
                        # 进一步确认：检查是否在登录表单区域
                        login_form = page.query_selector('form[action*="login"], .login-form, #login-form')
                        if login_form:
                            logger.warning(f"检测到登录表单，Cookies可能已失效")
                            return True
            except:
                pass
            
            return False
            
        except Exception as e:
            logger.debug(f"检查Cookies失效状态时出错: {str(e)}")
            return False
    
    def is_logged_in(self, page: Page) -> bool:
        """
        检查是否已登录（通过检查页面元素判断）
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            是否已登录
        """
        try:
            # 首先检查 Cookies 是否失效
            if self.is_cookies_expired(page):
                logger.warning("⚠️ Cookies 已失效，需要重新登录")
                return False
            
            # 访问淘宝首页，允许导航中断（登录后会自动跳转到"我的淘宝"）
            # 使用 domcontentloaded 而不是 networkidle，避免超时
            try:
                page.goto('https://www.taobao.com', timeout=60000, wait_until='domcontentloaded')
                # 等待网络空闲，但设置较短的超时（不强制要求）
                try:
                    page.wait_for_load_state('networkidle', timeout=10000)
                except PlaywrightTimeoutError:
                    logger.debug("网络未完全空闲，但页面已加载，继续检查")
            except PlaywrightTimeoutError as nav_error:
                # 超时时也继续，可能页面已经加载了基本内容
                logger.debug(f"页面加载超时，但继续检查登录状态: {str(nav_error)[:100]}")
                page.wait_for_timeout(2000)  # 等待一下让页面稳定
            except Exception as nav_error:
                # 如果是导航中断异常，可能是登录后的自动跳转，先等待一下
                if "interrupted" in str(nav_error).lower() or "navigation" in str(nav_error).lower():
                    logger.debug(f"检测到导航中断，可能是登录后的自动跳转: {nav_error}")
                    page.wait_for_timeout(3000)  # 等待跳转完成
                else:
                    logger.debug(f"导航出现其他异常，继续检查: {str(nav_error)[:100]}")
                    page.wait_for_timeout(2000)
            
            # 再次检查 Cookies 是否失效（可能在导航后失效）
            if self.is_cookies_expired(page):
                logger.warning("⚠️ Cookies 已失效（导航后检测），需要重新登录")
                return False
            
            # 等待页面稳定
            page.wait_for_timeout(2000)
            
            # 方法1: 检查当前 URL（如果跳转到"我的淘宝"，说明已登录）
            current_url = page.url
            if 'i.taobao.com/my_taobao' in current_url or 'i.taobao.com' in current_url:
                logger.debug(f"检测到跳转到我的淘宝页面，已登录: {current_url}")
                return True
            
            # 方法2: 检查是否存在登录后的元素（如用户昵称、购物车等）
            logged_in_indicators = [
                '.site-nav-user a[href*="member"]',  # 会员中心链接
                '.site-nav-user .username',  # 用户名
                '.h-member-name',  # 会员名
                '.site-nav-login .h',  # 登录后的用户名区域
            ]
            
            for selector in logged_in_indicators:
                try:
                    element = page.query_selector(selector)
                    if element:
                        text = element.inner_text().strip()
                        # 如果元素有文本且不是"登录"或"免费注册"，说明已登录
                        if text and '登录' not in text and '免费注册' not in text:
                            logger.debug(f"检测到登录元素: {selector} = {text}")
                            return True
                except:
                    continue
            
            # 方法3: 检查是否存在登录按钮（如果存在且可见，说明未登录）
            try:
                login_button = page.query_selector('.site-nav-login a[href*="login"]:visible')
                if login_button:
                    text = login_button.inner_text().strip()
                    if '登录' in text or '免费注册' in text:
                        logger.debug("检测到登录按钮，未登录状态")
                        return False
            except:
                pass
            
            # 方法4: 检查 Cookies 中是否有登录相关的 Cookie
            cookies = page.context.cookies()
            login_cookies = [c for c in cookies if 't' in c.get('name', '').lower() or 'lgc' in c.get('name', '').lower() or 'cna' in c.get('name', '').lower()]
            if len(login_cookies) > 0:
                logger.debug(f"检测到登录相关的 Cookies，假设已登录（{len(login_cookies)} 个）")
                return True
            
            # 如果都不确定，保守策略：假设已登录（因为可能有 Cookies）
            logger.warning("无法明确判断登录状态，假设已登录（保守策略）")
            return True
            
        except Exception as e:
            # 即使出错，也检查 URL 和 Cookies
            try:
                current_url = page.url
                if 'i.taobao.com' in current_url:
                    logger.debug(f"即使出错，检测到我的淘宝URL，已登录: {current_url}")
                    return True
                # 检查是否在登录页
                if self.is_cookies_expired(page):
                    logger.warning("⚠️ Cookies 已失效，需要重新登录")
                    return False
            except:
                pass
            
            logger.warning(f"检查登录状态时出错: {str(e)}，假设已登录")
            return True  # 出错时假设已登录，让后续流程继续
    
    def setup_login(self, interactive: bool = True) -> bool:
        """
        设置登录（持久化登录的核心函数）
        - 如果本地没有 auth_taobao.json，弹出浏览器让用户扫码登录，然后保存 Cookies
        - 如果有，就直接加载 Cookies
        
        Args:
            interactive: 是否交互模式（True 时等待用户输入 Enter，False 时自动检测登录完成）
        
        Returns:
            是否登录成功
        """
        logger.info("=" * 60)
        logger.info("淘宝登录设置")
        logger.info("=" * 60)
        
        with sync_playwright() as p:
            # 启动浏览器（登录时使用非无头模式，方便扫码）
            browser = p.chromium.launch(
                headless=False,  # 登录时必须显示浏览器窗口
                args=[
                    '--disable-blink-features=AutomationControlled',  # 隐藏自动化特征
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )
            
            context = browser.new_context(
                viewport=self.viewport,
                user_agent=self.user_agent,
                # 设置语言和地区（模拟真实用户）
                locale='zh-CN',
                timezone_id='Asia/Shanghai',
            )
            
            page = context.new_page()
            
            # 注入 JavaScript 隐藏 webdriver 特征
            page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                // 添加 Chrome 特征
                window.chrome = {
                    runtime: {}
                };
                // 覆盖 permissions API
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            """)
            
            try:
                # 情况1: 如果认证文件存在，尝试加载 Cookies
                if self.auth_file.exists():
                    logger.info(f"发现认证文件: {self.auth_file}")
                    logger.info("正在加载已保存的 Cookies...")
                    
                    if self.load_cookies(page):
                        # 等待一下让 Cookies 生效
                        page.wait_for_timeout(2000)
                        
                        # 验证是否登录成功
                        logger.info("正在验证登录状态...")
                        if self.is_logged_in(page):
                            logger.info("✅ 登录成功（使用已保存的 Cookies）")
                            browser.close()
                            return True
                        else:
                            logger.warning("⚠️ 已保存的 Cookies 已失效，需要重新登录")
                    else:
                        logger.warning("⚠️ 加载 Cookies 失败，需要重新登录")
                else:
                    logger.info("未找到认证文件，需要首次登录")
                
                # 情况2: 需要重新登录或首次登录
                logger.info("=" * 60)
                logger.info("请在浏览器中完成登录：")
                logger.info("1. 如果出现二维码，请使用手机淘宝扫码登录")
                logger.info("2. 登录成功后，请在浏览器中访问任意页面确认")
                logger.info("3. 登录完成后，请回到终端按 Enter 继续...")
                logger.info("=" * 60)
                
                # 访问淘宝登录页（使用 networkidle 更宽松的等待策略）
                try:
                    page.goto('https://login.taobao.com/member/login.jhtml', timeout=60000, wait_until='networkidle')
                except Exception as e:
                    # 如果导航被中断（比如自动跳转），继续等待
                    if "interrupted" in str(e).lower():
                        logger.debug("登录页导航被中断，可能是自动跳转")
                    else:
                        logger.warning(f"访问登录页时出现问题: {e}")
                page.wait_for_timeout(2000)
                
                # 等待用户手动登录
                logger.info("等待用户登录...")
                logger.info("提示：登录后如果页面自动跳转，说明登录成功")
                
                if interactive:
                    # 交互模式：等待用户输入
                    input("登录完成后，按 Enter 继续...")
                else:
                    # 非交互模式：自动检测登录完成
                    logger.info("自动检测登录状态...")
                    max_wait_time = 300  # 最多等待 5 分钟
                    check_interval = 3  # 每 3 秒检查一次
                    start_time = time.time()
                    
                    while time.time() - start_time < max_wait_time:
                        page.wait_for_timeout(check_interval * 1000)
                        
                        # 检查是否已登录
                        try:
                            if self.is_logged_in(page):
                                logger.info("✅ 检测到登录成功！")
                                break
                        except:
                            pass
                        
                        # 检查当前 URL 是否已跳转（说明登录成功）
                        current_url = page.url
                        if 'login.taobao.com' not in current_url and 'passport.taobao.com' not in current_url:
                            # 不在登录页了，可能是登录成功
                            logger.info(f"检测到页面跳转: {current_url}")
                            page.wait_for_timeout(2000)  # 等待页面稳定
                            if self.is_logged_in(page):
                                logger.info("✅ 检测到登录成功！")
                                break
                        
                        elapsed = int(time.time() - start_time)
                        if elapsed % 15 == 0:  # 每 15 秒提示一次
                            logger.info(f"等待登录中... ({elapsed}/{max_wait_time} 秒)")
                    else:
                        # 超时
                        logger.warning(f"⚠️ 等待登录超时（{max_wait_time} 秒），将检查当前状态...")
                
                # 等待一下让页面稳定（如果是自动跳转，需要时间）
                page.wait_for_timeout(3000)
                
                # 再次验证登录状态
                logger.info("正在验证登录状态...")
                if self.is_logged_in(page):
                    logger.info("✅ 登录验证成功！")
                    
                    # 保存 Cookies
                    if self.save_cookies(page):
                        logger.info("✅ 登录信息已保存，下次可以直接使用")
                        browser.close()
                        return True
                    else:
                        logger.error("⚠️ 登录成功，但保存 Cookies 失败")
                        browser.close()
                        return False
                else:
                    logger.error("❌ 登录验证失败，请检查是否已成功登录")
                    logger.info("提示：如果确实已登录，可能是因为验证逻辑问题，可以尝试重新运行")
                    browser.close()
                    return False
                    
            except KeyboardInterrupt:
                logger.info("\n用户中断登录流程")
                browser.close()
                return False
            except Exception as e:
                logger.error(f"登录过程出错: {str(e)}", exc_info=True)
                browser.close()
                return False
    
    def create_browser_context(self, playwright):
        """
        创建浏览器上下文（用于后续的爬取任务）
        
        Args:
            playwright: Playwright 实例
            
        Returns:
            (browser, context, page) 元组
        """
        browser = playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        
        context = browser.new_context(
            viewport=self.viewport,
            user_agent=self.user_agent,
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
        )
        
        page = context.new_page()
        
        # 注入 JavaScript 隐藏 webdriver 特征
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        """)
        
        # 加载已保存的 Cookies（如果存在）
        if self.auth_file.exists():
            self.load_cookies(page)
        
        return browser, context, page
    
    def check_and_handle_captcha(self, page: Page, timeout: int = 60) -> bool:
        """
        检查并处理验证码/滑块
        
        Args:
            page: Playwright Page 对象
            timeout: 等待超时时间（秒），默认60秒
            
        Returns:
            是否成功处理（False表示超时或失败）
        """
        # 验证码/滑块的多个可能选择器
        captcha_selectors = [
            '.nc_iconfont',  # 滑块验证码
            '.baxia-dialog',  # 验证码弹窗
            '#nocaptcha',  # 无验证码标识（但可能是验证码容器）
            '.nc-wrapper',  # 滑块验证码容器
            '.slider',  # 滑块
            '[class*="captcha"]',  # 包含captcha的类
            '[class*="verify"]',  # 包含verify的类
        ]
        
        try:
            # 等待一小段时间，让验证码元素有机会加载
            page.wait_for_timeout(2000)
            
            # 检查是否存在验证码元素
            captcha_element = None
            for selector in captcha_selectors:
                try:
                    captcha_element = page.query_selector(selector)
                    if captcha_element and captcha_element.is_visible():
                        logger.warning(f"⚠️ 检测到验证码元素: {selector}")
                        break
                except:
                    continue
            
            if not captcha_element:
                # 也检查页面URL是否包含验证相关路径
                current_url = page.url
                if 'verify' in current_url.lower() or 'captcha' in current_url.lower():
                    logger.warning(f"⚠️ 检测到验证码页面URL: {current_url}")
                    captcha_element = True  # 标记为存在
            
            if captcha_element:
                logger.warning("=" * 60)
                logger.warning("⚠️ 检测到验证码/滑块，需要人工处理")
                logger.warning("请在浏览器中完成验证，脚本将等待验证完成...")
                logger.warning(f"等待超时时间: {timeout} 秒")
                logger.warning("=" * 60)
                
                # 轮询检查验证码是否消失（每2秒检查一次）
                start_time = time.time()
                check_interval = 2  # 每2秒检查一次
                
                while time.time() - start_time < timeout:
                    # 检查验证码元素是否还存在
                    captcha_still_exists = False
                    for selector in captcha_selectors:
                        try:
                            elem = page.query_selector(selector)
                            if elem and elem.is_visible():
                                captcha_still_exists = True
                                break
                        except:
                            continue
                    
                    # 检查URL是否还是验证页面
                    if not captcha_still_exists:
                        current_url = page.url
                        if 'verify' not in current_url.lower() and 'captcha' not in current_url.lower():
                            logger.info("✅ 验证码已处理完成，继续执行...")
                            page.wait_for_timeout(1000)  # 等待页面稳定
                            return True
                    
                    # 等待后再次检查
                    page.wait_for_timeout(check_interval * 1000)
                    
                    elapsed = int(time.time() - start_time)
                    if elapsed % 10 == 0:  # 每10秒提示一次
                        logger.info(f"等待验证中... ({elapsed}/{timeout} 秒)")
                
                # 超时
                logger.error(f"❌ 验证码处理超时（{timeout} 秒），跳过当前页面")
                return False
            
            return True  # 没有验证码，正常继续
            
        except Exception as e:
            logger.error(f"检查验证码时出错: {str(e)}")
            return True  # 出错时假设没有验证码，继续执行
    
    def _search_keyword_internal(self, page: Page, keyword: str) -> bool:
        """
        搜索关键词的内部实现（用于重试）
        """
        logger.info(f"搜索关键词: {keyword}")
        
        # 访问淘宝搜索页（增加超时时间）
        search_url = f"https://s.taobao.com/search?q={keyword}"
        try:
            page.goto(search_url, timeout=60000, wait_until='domcontentloaded')
            # 等待网络空闲，但设置较长的超时
            page.wait_for_load_state('networkidle', timeout=30000)
        except PlaywrightTimeoutError as e:
            logger.warning(f"页面加载可能未完全完成，继续尝试: {str(e)[:100]}")
            # 即使超时也继续，可能网络慢但页面基本加载了
        
        # 等待页面稳定
        self.wait_random(2.0, 3.0)
        
        # 检查是否被重定向到登录页或错误页
        current_url = page.url
        if 'login.taobao.com' in current_url or 'passport.taobao.com' in current_url:
            logger.error(f"被重定向到登录页: {current_url}")
            raise Exception("需要重新登录")
        
        # 检查并处理验证码（增加等待时间）
        if not self.check_and_handle_captcha(page, timeout=60):
            logger.warning("验证码处理失败或超时，但继续尝试...")
        
        # 滚动页面以触发懒加载（淘宝搜索结果可能是懒加载的）
        logger.debug("滚动页面以触发商品懒加载...")
        try:
            # 先滚动到底部
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2000)
            # 再滚动到中间
            page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            page.wait_for_timeout(2000)
            # 滚动回顶部
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(2000)
        except Exception as e:
            logger.debug(f"滚动操作失败: {str(e)}")
        
        # 等待JavaScript执行完成（淘宝页面大量使用JS动态加载）
        try:
            # 等待页面JavaScript执行完成
            page.wait_for_function(
                "document.readyState === 'complete'",
                timeout=10000
            )
        except PlaywrightTimeoutError:
            logger.debug("页面JavaScript执行可能未完成，继续尝试...")
        
        # 等待搜索结果加载（使用多个选择器和更长的超时）
        # 淘宝搜索结果可能的容器选择器
        possible_selectors = [
            '.items .item',  # 标准选择器
            '.m-itemlist .items .item',  # 可能的完整路径
            '[data-category="auctions"]',  # 数据属性
            '.item[data-category="auctions"]',  # 组合选择器
            '.item',  # 更通用的选择器
        ]
        
        element_found = False
        for selector in possible_selectors:
            try:
                logger.debug(f"尝试等待选择器: {selector}")
                # 使用 attached 状态而不是 visible，因为元素可能在视口外
                page.wait_for_selector(selector, timeout=5000, state='attached')  # 减少超时时间
                # 验证元素是否真的存在
                elements = page.query_selector_all(selector)
                if elements and len(elements) > 0:
                    logger.info(f"✅ 找到商品元素: {selector} (共 {len(elements)} 个)")
                    element_found = True
                    break
                else:
                    logger.debug(f"选择器 {selector} 存在但未找到元素")
            except PlaywrightTimeoutError:
                logger.debug(f"选择器 {selector} 超时，尝试下一个")
                continue
        
        if not element_found:
            # 尝试检查页面是否有内容（可能是反爬虫拦截）
            try:
                page_content = page.content()
                page_text = page.inner_text('body') if page.query_selector('body') else ''
                
                # 检查反爬虫拦截
                if '验证' in page_content or '验证码' in page_content:
                    logger.warning("⚠️ 页面可能包含验证码，但未被检测到")
                if '访问异常' in page_content or '安全验证' in page_content:
                    logger.error("❌ 页面显示访问异常或安全验证")
                    raise Exception("被反爬虫机制拦截")
                
                # 检查是否有"没有找到相关商品"等提示
                no_result_keywords = ['没有找到', '暂无商品', '搜索结果为空', '未找到相关']
                if any(keyword in page_text for keyword in no_result_keywords):
                    logger.warning(f"⚠️ 页面提示没有找到商品")
                    raise Exception("搜索结果为空")
                
                # 检查页面标题
                page_title = page.title()
                logger.info(f"当前页面标题: {page_title}")
                logger.info(f"当前URL: {page.url}")
                
            except Exception as e:
                if "被反爬虫" in str(e) or "搜索结果为空" in str(e):
                    raise
                logger.debug(f"页面内容检查失败: {str(e)}")
            
            # 最后尝试：直接查询所有可能的商品元素（不等待）
            logger.info("🔍 尝试直接查询商品元素...")
            try:
                # 等待页面再加载一下
                page.wait_for_timeout(2000)
                # 再次滚动触发加载
                page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
                page.wait_for_timeout(1500)
                
                # 直接查询多种可能的选择器
                test_selectors = [
                    '.item',
                    '[data-category="auctions"]',
                    '.items .item',
                    '.m-itemlist .items .item',
                ]
                
                for test_selector in test_selectors:
                    test_elements = page.query_selector_all(test_selector)
                    if test_elements and len(test_elements) > 0:
                        logger.info(f"✅ 直接查询找到 {len(test_elements)} 个商品元素（选择器: {test_selector}），继续提取")
                        element_found = True
                        break
                
                if not element_found:
                    logger.warning("⚠️ 直接查询也未找到商品元素，但将继续尝试提取")
            except Exception as e:
                logger.debug(f"直接查询失败: {str(e)}")
        
        # 即使没找到标准元素，也继续执行（可能页面结构不同）
        if not element_found:
            logger.warning("⚠️ 未找到标准商品容器，将在提取阶段继续尝试")
        
        logger.info(f"✅ 搜索结果页面准备完成: {keyword}")
        return True
    
    def search_keyword(self, page: Page, keyword: str) -> bool:
        """
        搜索关键词（带重试机制）
        
        Args:
            page: Playwright Page 对象
            keyword: 搜索关键词
            
        Returns:
            是否搜索成功
        """
        try:
            # 使用重试机制（增加重试次数，因为网络可能不稳定）
            self.retry_with_backoff(
                self._search_keyword_internal,
                max_retries=5,  # 增加到5次重试
                base_delay=2.0,  # 增加基础延迟时间
                backoff_factor=1.5,  # 降低退避因子，避免等待时间过长
                page=page,
                keyword=keyword
            )
            
            # 检查 Cookies 是否失效
            if self.is_cookies_expired(page):
                logger.error("❌ Cookies 已失效，需要重新登录")
                logger.error("💡 提示: 请运行登录设置: python scripts/taobao_miner.py --setup-login")
                # 记录失效状态（可以保存到文件或数据库）
                return False
            
            return True
            
        except PlaywrightTimeoutError as e:
            logger.warning(f"⚠️ 等待搜索结果超时: {keyword} - {str(e)[:200]}")
            # 检查是否在登录页
            current_url = page.url
            if 'login.taobao.com' in current_url or 'passport.taobao.com' in current_url:
                logger.error(f"❌ 被重定向到登录页: {current_url}")
                logger.error("💡 请检查登录状态或重新登录")
                return False
            logger.info("⚠️ 超时但将继续尝试提取（可能页面已部分加载）")
            return True  # 即使超时也继续，可能页面结构不同
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ 搜索关键词失败: {keyword} - {error_msg[:200]}")
            # 如果是关键错误（反爬虫、登录等），返回False
            if "被反爬虫" in error_msg or "登录" in error_msg or "搜索结果为空" in error_msg:
                return False
            # 其他错误，尝试继续
            logger.warning("⚠️ 出现错误但将继续尝试提取")
            return True
    
    def extract_products_from_page(self, page: Page) -> List[Dict[str, any]]:
        """
        从当前页面提取商品信息
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            商品信息列表
        """
        products = []
        
        try:
            # 先滚动页面以触发懒加载 - 更积极的滚动策略
            logger.info("🔄 滚动页面以触发商品懒加载...")
            try:
                # 更频繁的分段滚动，确保所有商品都加载
                max_scrolls = 5  # 最多滚动5次
                last_count = 0
                stable_count = 0
                
                for scroll_round in range(max_scrolls):
                    # 滚动到不同位置
                    scroll_positions = [0.2, 0.4, 0.6, 0.8, 1.0]
                    for pos in scroll_positions:
                        page.evaluate(f"window.scrollTo(0, document.body.scrollHeight * {pos})")
                        page.wait_for_timeout(800)  # 减少等待时间
                    
                    # 滚动回顶部
                    page.evaluate("window.scrollTo(0, 0)")
                    page.wait_for_timeout(500)
                    
                    # 检查当前有多少商品元素（快速检查）
                    try:
                        quick_check = page.evaluate("""
                            () => {
                                const items = document.querySelectorAll('.items .item, .item[data-category="auctions"], [data-category="auctions"]');
                                return items.length;
                            }
                        """)
                        
                        if quick_check > last_count:
                            last_count = quick_check
                            stable_count = 0
                            logger.debug(f"第 {scroll_round + 1} 轮滚动后检测到 {quick_check} 个商品")
                        elif quick_check == last_count and quick_check > 0:
                            stable_count += 1
                            if stable_count >= 2:  # 连续2次数量不变，认为已加载完成
                                logger.info(f"✅ 商品加载稳定，共 {quick_check} 个商品")
                                break
                    except:
                        pass
                    
                    if stable_count >= 2:
                        break
                    
                    # 如果已经有足够多的商品，可以提前结束
                    if last_count >= 40:
                        logger.info(f"✅ 已检测到足够多的商品 ({last_count} 个)，继续提取")
                        break
            except Exception as e:
                logger.debug(f"滚动操作失败: {str(e)}")
            
            # 直接查询商品元素，不等待选择器（滚动后应该已经加载）
            logger.info("🔍 查询商品元素...")
            
            # 优先使用的选择器（按准确度排序）
            priority_selectors = [
                '.items .item',  # 最准确
                '.items .item[data-category="auctions"]',
                '.item[data-category="auctions"]',
                '[data-category="auctions"]',
                '.m-itemlist .items .item',
            ]
            
            product_elements = None
            used_selector = None
            
            # 快速尝试每个选择器
            for selector in priority_selectors:
                try:
                    elements = page.query_selector_all(selector)
                    if elements and len(elements) > 0:
                        product_elements = elements
                        used_selector = selector
                        logger.info(f"✅ 使用选择器 '{selector}' 找到 {len(elements)} 个商品元素")
                        break
                except Exception as e:
                    logger.debug(f"选择器 {selector} 查询失败: {str(e)}")
                    continue
            
            # 如果都没找到，尝试更通用的方法
            if not product_elements or len(product_elements) == 0:
                logger.warning("⚠️ 标准选择器未找到商品，尝试更通用的方法...")
                try:
                    # 使用JavaScript直接查询，更快速
                    element_count = page.evaluate("""
                        () => {
                            // 尝试多种选择器
                            const selectors = [
                                '.items .item',
                                '.item[data-category="auctions"]',
                                '[data-category="auctions"]',
                                '.m-itemlist .items .item',
                                '.item',
                            ];
                            
                            for (const sel of selectors) {
                                const items = document.querySelectorAll(sel);
                                if (items.length > 0) {
                                    return items.length;
                                }
                            }
                            return 0;
                        }
                    """)
                    
                    if element_count > 0:
                        # 如果找到了，使用最通用的选择器获取
                        product_elements = page.query_selector_all('.items .item, .item[data-category="auctions"], [data-category="auctions"]')
                        used_selector = '通用查询'
                        logger.info(f"✅ 使用通用方法找到 {len(product_elements)} 个商品元素")
                    else:
                        logger.warning("⚠️ 通用方法也未找到商品元素")
                except Exception as e:
                    logger.debug(f"通用查询失败: {str(e)}")
            
            # 提取商品元素（淘宝搜索结果的商品项）
            # product_elements 应该已经在上面获取到了
            # 如果还没有，说明前面的逻辑有问题
            
            if not product_elements or len(product_elements) == 0:
                logger.error("❌ 未找到商品元素，页面结构可能已变化或页面未完全加载")
                logger.info(f"当前页面URL: {page.url}")
                logger.info(f"当前页面标题: {page.title()}")
                
                # 尝试输出页面结构用于调试
                try:
                    structure_info = page.evaluate("""
                        () => {
                            const body = document.body;
                            const itemContainers = body.querySelectorAll('[class*="item"], [data-category], [id*="item"]');
                            return {
                                total_items: itemContainers.length,
                                classes: Array.from(itemContainers).slice(0, 5).map(el => el.className)
                            };
                        }
                    """)
                    logger.debug(f"页面结构信息: {structure_info}")
                except:
                    pass
                
                # 保存页面HTML和截图以便调试
                try:
                    screenshot_dir = Path("scripts/screenshots")
                    screenshot_dir.mkdir(parents=True, exist_ok=True)
                    timestamp = int(time.time())
                    
                    # 保存截图
                    screenshot_path = screenshot_dir / f"debug_no_products_{timestamp}.png"
                    page.screenshot(path=str(screenshot_path), full_page=True)
                    logger.info(f"📸 已保存调试截图: {screenshot_path}")
                    
                    # 保存页面HTML（前10000字符）
                    try:
                        html_content = page.content()
                        html_path = screenshot_dir / f"debug_no_products_{timestamp}.html"
                        with open(html_path, 'w', encoding='utf-8') as f:
                            f.write(html_content[:50000])  # 只保存前50KB
                        logger.info(f"已保存页面HTML: {html_path}")
                    except Exception as e:
                        logger.debug(f"保存HTML失败: {str(e)}")
                except Exception as e:
                    logger.debug(f"保存调试信息失败: {str(e)}")
                return products
            
            logger.info(f"✅ 找到 {len(product_elements)} 个商品元素，开始提取详细信息...")
            
            # 限制提取数量，避免过多（每页通常48个商品）
            max_extract = min(len(product_elements), 48)
            if len(product_elements) > max_extract:
                logger.info(f"📊 商品数量较多（{len(product_elements)}），将提取前 {max_extract} 个")
            product_elements = product_elements[:max_extract]
            
            logger.info(f"📦 准备提取 {len(product_elements)} 个商品的详细信息...")
            
            extracted_count = 0
            for idx, item in enumerate(product_elements, 1):
                if idx % 10 == 0:
                    logger.info(f"📊 提取进度: {idx}/{len(product_elements)} ({extracted_count} 个成功)")
                try:
                    product_info = {}
                    
                    # 提取标题 - 扩展更多选择器
                    title_selectors = [
                        '.title a',  # 标题链接
                        '.title',  # 标题容器
                        'a[title]',  # 带title属性的链接
                        '.J_ClickStat',  # 点击统计元素
                        'a.J_ClickStat',  # 点击统计链接
                        '.item-title',  # 商品标题类
                        '.item-title a',  # 商品标题链接
                        '[class*="title"] a',  # 包含title的类的链接
                        '[class*="Title"] a',  # 包含Title的类的链接
                        'a[href*="item"]',  # 商品链接
                        '.pic-link',  # 图片链接（通常包含title）
                        'a.pic-link',  # 图片链接
                    ]
                    
                    title = None
                    title_link = None
                    title_extraction_method = None
                    
                    # 方法1: 使用标准选择器
                    for title_sel in title_selectors:
                        try:
                            title_elem = item.query_selector(title_sel)
                            if title_elem:
                                # 尝试多种方式获取标题
                                title = title_elem.get_attribute('title')
                                if not title:
                                    title = title_elem.get_attribute('alt')  # 图片alt属性
                                if not title:
                                    title = title_elem.inner_text().strip()
                                
                                if title and len(title) > 5:  # 标题应该有一定长度
                                    title_link = title_elem.get_attribute('href')
                                    title_extraction_method = f"选择器: {title_sel}"
                                    break
                        except Exception as e:
                            logger.debug(f"标题选择器 {title_sel} 失败: {str(e)}")
                            continue
                    
                    # 方法2: 如果标准选择器失败，尝试查找元素内的所有链接
                    if not title:
                        try:
                            # 查找元素内所有链接
                            all_links = item.query_selector_all('a')
                            for link in all_links:
                                try:
                                    # 检查链接是否指向商品详情页
                                    href = link.get_attribute('href') or ''
                                    if 'item.taobao.com' in href or 'detail.tmall.com' in href or '/item/' in href:
                                        # 尝试从链接获取标题
                                        link_title = link.get_attribute('title')
                                        if not link_title:
                                            link_title = link.inner_text().strip()
                                        if link_title and len(link_title) > 5:
                                            title = link_title
                                            title_link = href
                                            title_extraction_method = "从商品链接提取"
                                            break
                                except:
                                    continue
                        except Exception as e:
                            logger.debug(f"从链接提取标题失败: {str(e)}")
                    
                    # 方法3: 如果还是失败，尝试从元素本身提取文本
                    if not title:
                        try:
                            # 获取元素的所有文本内容
                            all_text = item.inner_text().strip()
                            if all_text:
                                # 尝试提取最长的文本行作为标题
                                lines = [line.strip() for line in all_text.split('\n') if line.strip()]
                                if lines:
                                    # 找到最长的行（通常是标题）
                                    longest_line = max(lines, key=len)
                                    if len(longest_line) > 5:
                                        title = longest_line
                                        title_extraction_method = "从元素文本提取"
                                        
                                        # 尝试找到对应的链接
                                        try:
                                            link_in_item = item.query_selector('a[href*="item"]')
                                            if link_in_item:
                                                title_link = link_in_item.get_attribute('href')
                                        except:
                                            pass
                        except Exception as e:
                            logger.debug(f"从元素文本提取标题失败: {str(e)}")
                    
                    if not title:
                        # 输出详细的调试信息（只在debug模式下）
                        if logger.level <= 10:  # DEBUG level
                            try:
                                item_html = item.inner_html()[:200]  # 前200字符
                                logger.debug(f"商品 {idx} 未找到标题，HTML预览: {item_html}...")
                            except:
                                pass
                        continue
                    
                    if idx <= 3 or idx % 10 == 0:  # 前3个和每10个输出详细日志
                        logger.debug(f"商品 {idx} 标题提取成功 ({title_extraction_method}): {title[:50]}...")
                    
                    product_info['title'] = title.strip()
                    
                    # 处理链接（如果是相对路径，补全为完整URL）
                    if title_link:
                        if title_link.startswith('//'):
                            title_link = 'https:' + title_link
                        elif title_link.startswith('/'):
                            title_link = 'https://www.taobao.com' + title_link
                        product_info['detail_url'] = title_link
                    else:
                        product_info['detail_url'] = None
                    
                    # 提取价格 - 扩展更多选择器
                    price_selectors = [
                        '.price strong',  # 价格强标签
                        '.price',  # 价格容器
                        '.price .price-num',  # 价格数字
                        '.item-price',  # 商品价格类
                        '[class*="price"]',  # 包含price的类
                        '[class*="Price"]',  # 包含Price的类
                        '.g-price',  # g-开头的价格类
                        '.price-box',  # 价格盒子
                    ]
                    
                    price = None
                    for price_sel in price_selectors:
                        try:
                            price_elem = item.query_selector(price_sel)
                            if price_elem:
                                price_text = price_elem.inner_text().strip()
                                # 提取数字部分（支持小数点）
                                price_match = re.search(r'(\d+\.?\d*)', price_text.replace(',', '').replace('￥', '').replace('¥', ''))
                                if price_match:
                                    price_val = float(price_match.group(1))
                                    # 价格应该合理（1-100000之间）
                                    if 1 <= price_val <= 100000:
                                        price = price_val
                                        break
                        except Exception as e:
                            logger.debug(f"价格选择器 {price_sel} 失败: {str(e)}")
                            continue
                    
                    # 如果标准选择器失败，尝试从元素文本中提取价格
                    if price is None:
                        try:
                            all_text = item.inner_text()
                            # 查找包含"￥"或"¥"的文本
                            price_patterns = [
                                r'[￥¥]\s*(\d+\.?\d*)',  # ￥123.45
                                r'(\d+\.?\d*)\s*元',  # 123.45元
                                r'价格[：:]\s*(\d+\.?\d*)',  # 价格：123.45
                            ]
                            for pattern in price_patterns:
                                match = re.search(pattern, all_text)
                                if match:
                                    price_val = float(match.group(1))
                                    if 1 <= price_val <= 100000:
                                        price = price_val
                                        break
                        except:
                            pass
                    
                    product_info['price'] = price
                    
                    # 提取销量 - 扩展更多选择器和模式
                    sales_selectors = [
                        '.deal-cnt',  # 成交数
                        '.sales',  # 销量
                        '[class*="deal"]',  # 包含deal的类
                        '[class*="Deal"]',  # 包含Deal的类
                        '.item-sales',  # 商品销量类
                        '[class*="sales"]',  # 包含sales的类
                        '[class*="Sales"]',  # 包含Sales的类
                    ]
                    
                    sales = None
                    for sales_sel in sales_selectors:
                        try:
                            sales_elem = item.query_selector(sales_sel)
                            if sales_elem:
                                sales_text = sales_elem.inner_text().strip()
                                # 提取数字，处理"月销100+"、"100+"、"1.5万+"等格式
                                sales_text = sales_text.replace('月销', '').replace('人付款', '').replace('+', '').strip()
                                
                                # 处理"万"单位
                                if '万' in sales_text:
                                    num_match = re.search(r'(\d+\.?\d*)', sales_text)
                                    if num_match:
                                        sales = int(float(num_match.group(1)) * 10000)
                                else:
                                    num_match = re.search(r'(\d+)', sales_text.replace(',', ''))
                                    if num_match:
                                        sales = int(num_match.group(1))
                                if sales:
                                    break
                        except Exception as e:
                            logger.debug(f"销量选择器 {sales_sel} 失败: {str(e)}")
                            continue
                    
                    # 如果标准选择器失败，尝试从元素文本中提取销量
                    if sales is None:
                        try:
                            all_text = item.inner_text()
                            # 查找包含销量关键词的文本
                            sales_patterns = [
                                r'月销[：:]?\s*(\d+)',  # 月销1000
                                r'已售[：:]?\s*(\d+)',  # 已售1000
                                r'(\d+)\s*人付款',  # 1000人付款
                                r'销量[：:]?\s*(\d+)',  # 销量1000
                                r'成交[：:]?\s*(\d+)',  # 成交1000
                            ]
                            for pattern in sales_patterns:
                                match = re.search(pattern, all_text)
                                if match:
                                    sales = int(match.group(1))
                                    break
                        except:
                            pass
                    
                    product_info['sales'] = sales
                    
                    # 提取店铺名
                    shop_selectors = [
                        '.shop a',  # 店铺链接
                        '.shop',  # 店铺容器
                        '.nick',  # 店铺昵称
                    ]
                    
                    shop_name = None
                    for shop_sel in shop_selectors:
                        try:
                            shop_elem = item.query_selector(shop_sel)
                            if shop_elem:
                                shop_name = shop_elem.inner_text().strip()
                                if shop_name:
                                    break
                        except:
                            continue
                    
                    product_info['shop_name'] = shop_name
                    
                    # 提取店铺类型（C店/天猫）
                    shop_type = None
                    try:
                        # 检查商品链接或店铺链接是否包含 tmall
                        detail_url = product_info.get('detail_url', '')
                        if detail_url:
                            if 'tmall.com' in detail_url or 'detail.tmall' in detail_url:
                                shop_type = 'tmall'
                            elif 'taobao.com' in detail_url:
                                shop_type = 'c_shop'
                        
                        # 也可以通过页面元素判断
                        if not shop_type:
                            shop_badge = item.query_selector('.shop-badge, .shop-type, [class*="tmall"]')
                            if shop_badge:
                                badge_text = shop_badge.inner_text().strip().lower()
                                if '天猫' in badge_text or 'tmall' in badge_text:
                                    shop_type = 'tmall'
                                else:
                                    shop_type = 'c_shop'
                        
                        product_info['shop_type'] = shop_type
                    except:
                        product_info['shop_type'] = None
                    
                    # 只添加有标题的商品（基本要求）
                    if product_info.get('title'):
                        products.append(product_info)
                        extracted_count += 1
                        # 只输出前5个和每10个，减少日志量
                        if idx <= 5 or (idx % 10 == 0):
                            logger.info(f"✅ [{idx}/{len(product_elements)}] {product_info['title'][:40]}... | ¥{price or 'N/A'} | 销量:{sales or 'N/A'}")
                    else:
                        if idx <= 3:  # 只输出前3个失败的
                            logger.debug(f"❌ 商品 {idx} 未提取到标题，跳过")
                    
                except Exception as e:
                    logger.warning(f"提取商品 {idx} 信息时出错: {str(e)}")
                    # 输出元素的基本信息用于调试
                    try:
                        item_class = item.get_attribute('class') or 'N/A'
                        logger.debug(f"失败元素的class: {item_class[:100]}")
                    except:
                        pass
                    continue
            
            logger.info(f"✅ 成功提取 {len(products)} 个商品信息 (从 {len(product_elements)} 个元素中)")
            if len(products) == 0 and len(product_elements) > 0:
                logger.warning(f"⚠️ 警告: 找到了 {len(product_elements)} 个商品元素，但提取失败。可能需要检查页面结构。")
                # 输出第一个元素的HTML用于调试
                try:
                    first_elem_html = product_elements[0].inner_html()[:500]
                    logger.debug(f"第一个元素的HTML预览: {first_elem_html}...")
                except:
                    pass
            
        except Exception as e:
            logger.error(f"提取商品信息时出错: {str(e)}")
        
        return products
    
    def go_to_next_page(self, page: Page) -> bool:
        """
        翻到下一页
        
        Args:
            page: Playwright Page 对象
            
        Returns:
            是否成功翻页
        """
        try:
            # 查找"下一页"按钮
            next_page_selectors = [
                '.next:not(.disabled)',  # 下一页按钮（未禁用）
                'a[aria-label="下一页"]',  # 无障碍标签
                '.pagination .next',
                '.page-next:not(.disabled)',
            ]
            
            next_button = None
            for selector in next_page_selectors:
                try:
                    next_button = page.query_selector(selector)
                    if next_button and next_button.is_visible():
                        break
                except:
                    continue
            
            if not next_button:
                logger.debug("未找到下一页按钮，可能已到最后一页")
                return False
            
            # 检查是否被禁用
            try:
                if 'disabled' in next_button.get_attribute('class') or '':
                    logger.debug("下一页按钮已禁用，已到最后一页")
                    return False
            except:
                pass
            
            # 点击下一页
            next_button.click()
            
            # 等待页面加载（增加等待时间）
            self.wait_random(2.0, 3.0)
            try:
                page.wait_for_load_state('networkidle', timeout=20000)
            except PlaywrightTimeoutError:
                logger.warning("翻页后网络未完全空闲，继续等待...")
                page.wait_for_timeout(3000)
            
            # 验证是否成功翻页（等待新商品加载，使用多个选择器）
            possible_selectors = [
                '.items .item',
                '.items .item[data-category="auctions"]',
                '[data-category="auctions"]',
            ]
            
            for selector in possible_selectors:
                try:
                    page.wait_for_selector(selector, timeout=15000, state='visible')
                    logger.debug(f"成功翻到下一页，找到元素: {selector}")
                    return True
                except PlaywrightTimeoutError:
                    continue
            
            logger.warning("翻页后等待商品加载超时，但继续尝试提取")
            return True  # 即使超时也认为成功，可能在 extract 中能找到
            
        except Exception as e:
            logger.error(f"翻页失败: {str(e)}")
            return False
    
    def mine_keywords(self, seed_words: List[str], max_pages: int = 5, 
                     min_sales: int = 50, max_sales: int = 5000, 
                     apply_sales_filter: bool = False) -> List[Dict[str, any]]:
        """
        挖掘关键词（核心抓取逻辑）
        
        Args:
            seed_words: 种子词列表，例如 ["野生", "自制"]
            max_pages: 每个种子词最多抓取页数（默认5页）
            min_sales: 最小销量过滤（默认50）
            max_sales: 最大销量过滤（默认5000）
            
        Returns:
            所有抓取到的商品列表
        """
        all_products = []
        
        logger.info("=" * 60)
        logger.info("开始淘宝关键词挖掘")
        logger.info(f"种子词: {', '.join(seed_words)}")
        logger.info(f"每个词抓取页数: {max_pages}")
        logger.info(f"销量过滤范围: {min_sales} - {max_sales}")
        logger.info("=" * 60)
        
        with sync_playwright() as p:
            browser, context, page = self.create_browser_context(p)
            
            try:
                # 验证登录状态
                if not self.is_logged_in(page):
                    logger.error("❌ 未登录，请先运行登录设置: python taobao_miner.py")
                    browser.close()
                    return all_products
                
                logger.info("✅ 登录状态验证通过")
                
                # 遍历每个种子词
                for seed_idx, seed_word in enumerate(seed_words, 1):
                    logger.info("=" * 60)
                    logger.info(f"[{seed_idx}/{len(seed_words)}] 处理种子词: {seed_word}")
                    logger.info("=" * 60)
                    
                    # 搜索关键词
                    logger.info(f"🔍 开始搜索关键词: {seed_word}")
                    search_success = self.search_keyword(page, seed_word)
                    
                    if not search_success:
                        logger.warning(f"⚠️ 搜索可能失败，但将继续尝试提取种子词: {seed_word}")
                        # 不直接跳过，尝试提取当前页面（可能部分加载成功）
                    
                    # 遍历每一页
                    for page_num in range(1, max_pages + 1):
                        logger.info("")
                        logger.info(f"{'='*60}")
                        logger.info(f"--- 第 {page_num} 页 ---")
                        logger.info(f"{'='*60}")
                        
                        # 提取当前页商品
                        logger.info(f"📦 开始提取第 {page_num} 页商品...")
                        try:
                            products = self.extract_products_from_page(page)
                            logger.info(f"✅ 第 {page_num} 页提取完成，获得 {len(products)} 个商品")
                        except Exception as e:
                            logger.error(f"❌ 提取第 {page_num} 页商品时出错: {str(e)[:200]}")
                            products = []  # 空列表，继续下一页
                        
                        # 添加种子词信息到商品数据
                        for product in products:
                            product['seed_word'] = seed_word
                            product['page_num'] = page_num
                        
                        # 如果启用销量过滤，在这里先过滤（但通常在外层统一过滤更好）
                        if apply_sales_filter:
                            products = self.filter_products_by_sales(products, min_sales, max_sales)
                        
                        all_products.extend(products)
                        logger.info(f"当前页提取 {len(products)} 个商品，累计 {len(all_products)} 个")
                        
                        # 如果不是最后一页，尝试翻页
                        if page_num < max_pages:
                            # 随机等待再翻页
                            self.wait_random(2.0, 4.0)
                            
                            if not self.go_to_next_page(page):
                                logger.info(f"无法翻页，停止抓取种子词: {seed_word}")
                                break
                        else:
                            logger.info(f"已完成 {max_pages} 页抓取，继续下一个种子词")
                    
                    # 每个种子词之间等待
                    if seed_idx < len(seed_words):
                        logger.info("等待后处理下一个种子词...")
                        self.wait_random(3.0, 5.0)
                
                logger.info("=" * 60)
                logger.info(f"✅ 抓取完成！共获取 {len(all_products)} 个商品")
                logger.info("=" * 60)
                
            except KeyboardInterrupt:
                logger.info("\n用户中断抓取")
            except Exception as e:
                logger.error(f"抓取过程中出错: {str(e)}", exc_info=True)
            finally:
                browser.close()
        
        return all_products
    
    def filter_products_by_sales(self, products: List[Dict[str, any]], 
                                  min_sales: int, max_sales: int) -> List[Dict[str, any]]:
        """
        按销量过滤商品
        
        Args:
            products: 商品列表
            min_sales: 最小销量
            max_sales: 最大销量
            
        Returns:
            过滤后的商品列表
        """
        filtered = []
        for product in products:
            sales = product.get('sales')
            if sales is None:
                continue
            if min_sales <= sales <= max_sales:
                filtered.append(product)
        return filtered
    
    def filter_products_by_price(self, products: List[Dict[str, any]], 
                                 min_price: Optional[float] = None, 
                                 max_price: Optional[float] = None) -> List[Dict[str, any]]:
        """
        按价格过滤商品
        
        Args:
            products: 商品列表
            min_price: 最小价格（可选）
            max_price: 最大价格（可选）
            
        Returns:
            过滤后的商品列表
        """
        if min_price is None and max_price is None:
            return products  # 没有价格筛选条件，返回全部
        
        filtered = []
        for product in products:
            price = product.get('price')
            if price is None:
                continue
            
            # 检查价格范围
            if min_price is not None and price < min_price:
                continue
            if max_price is not None and price > max_price:
                continue
            
            filtered.append(product)
        return filtered
    
    def filter_products_by_keywords(self, products: List[Dict[str, any]],
                                   must_contain: Optional[List[str]] = None,
                                   must_not_contain: Optional[List[str]] = None) -> List[Dict[str, any]]:
        """
        按关键词过滤商品（必须包含/不能包含）
        
        Args:
            products: 商品列表
            must_contain: 必须包含的关键词列表（AND 关系，所有关键词都要包含）
            must_not_contain: 不能包含的关键词列表（OR 关系，包含任意一个就排除）
            
        Returns:
            过滤后的商品列表
        """
        if not must_contain and not must_not_contain:
            return products  # 没有关键词筛选条件，返回全部
        
        filtered = []
        for product in products:
            title = product.get('title', '').lower()
            
            # 必须包含：所有关键词都要包含（AND 关系）
            if must_contain:
                all_contained = True
                for keyword in must_contain:
                    if keyword.lower() not in title:
                        all_contained = False
                        break
                if not all_contained:
                    continue
            
            # 不能包含：包含任意一个就排除（OR 关系）
            if must_not_contain:
                should_exclude = False
                for keyword in must_not_contain:
                    if keyword.lower() in title:
                        should_exclude = True
                        break
                if should_exclude:
                    continue
            
            filtered.append(product)
        return filtered
    
    def filter_products_by_shop_type(self, products: List[Dict[str, any]],
                                    shop_type: Optional[str] = None) -> List[Dict[str, any]]:
        """
        按店铺类型过滤商品
        
        Args:
            products: 商品列表
            shop_type: 店铺类型 ('tmall'/'c_shop'/None)，None 表示不限
            
        Returns:
            过滤后的商品列表
        """
        if shop_type is None or shop_type == 'all':
            return products  # 不限店铺类型，返回全部
        
        filtered = []
        for product in products:
            product_shop_type = product.get('shop_type')
            if shop_type == 'tmall' and product_shop_type == 'tmall':
                filtered.append(product)
            elif shop_type == 'c_shop' and product_shop_type == 'c_shop':
                filtered.append(product)
            elif shop_type == 'c_shop' and product_shop_type is None:
                # 如果无法识别店铺类型，默认当作 C店 处理
                filtered.append(product)
        
        return filtered
    
    def clean_title_as_keyword(self, title: str) -> str:
        """
        清洗商品标题，提取为关键词
        
        Args:
            title: 商品标题
            
        Returns:
            清洗后的关键词
        """
        if not title:
            return ""
        
        # 移除常见的标点符号和特殊字符
        # 保留中文、英文、数字和基本标点
        import re
        # 移除特殊字符，但保留中文、英文、数字、空格
        cleaned = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9\s]', ' ', title)
        # 移除多余空格
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned
    
    def mine_and_save(self, seed_words: List[str], project_id: str, 
                     max_pages: int = 5, min_sales: int = 50, 
                     max_sales: int = 5000,
                     min_price: Optional[float] = None,
                     max_price: Optional[float] = None,
                     must_contain_keywords: Optional[List[str]] = None,
                     must_not_contain_keywords: Optional[List[str]] = None,
                     shop_type: Optional[str] = None) -> Dict[str, int]:
        """
        挖掘关键词并保存到数据库
        
        Args:
            seed_words: 种子词列表
            project_id: 项目ID
            max_pages: 每个种子词最多抓取页数
            min_sales: 最小销量
            max_sales: 最大销量
            min_price: 最小价格（可选）
            max_price: 最大价格（可选）
            must_contain_keywords: 必须包含的关键词列表（可选）
            must_not_contain_keywords: 不能包含的关键词列表（可选）
            shop_type: 店铺类型 ('tmall'/'c_shop'/None，None表示不限)
            
        Returns:
            统计信息字典
        """
        if not self.supabase:
            logger.error("❌ Supabase 客户端未初始化，无法保存数据")
            return {'total_crawled': 0, 'after_sales_filter': 0, 'after_price_filter': 0, 
                   'after_keyword_filter': 0, 'after_shop_type_filter': 0, 'inserted': 0}
        
        # 抓取商品
        all_products = self.mine_keywords(
            seed_words=seed_words,
            max_pages=max_pages,
            min_sales=min_sales,
            max_sales=max_sales,
            apply_sales_filter=False  # 统一在外层过滤
        )
        
        total_crawled = len(all_products)
        logger.info(f"📊 抓取完成，共 {total_crawled} 个商品")
        
        # 按销量过滤
        filtered_products = self.filter_products_by_sales(all_products, min_sales, max_sales)
        after_sales_filter = len(filtered_products)
        logger.info(f"📊 销量过滤后: {after_sales_filter} 个商品")
        
        # 按价格过滤
        if min_price is not None or max_price is not None:
            filtered_products = self.filter_products_by_price(
                filtered_products, min_price, max_price
            )
        after_price_filter = len(filtered_products)
        if min_price is not None or max_price is not None:
            logger.info(f"📊 价格过滤后: {after_price_filter} 个商品")
        
        # 按关键词过滤
        if must_contain_keywords or must_not_contain_keywords:
            filtered_products = self.filter_products_by_keywords(
                filtered_products,
                must_contain=must_contain_keywords,
                must_not_contain=must_not_contain_keywords
            )
        after_keyword_filter = len(filtered_products)
        if must_contain_keywords or must_not_contain_keywords:
            logger.info(f"📊 关键词过滤后: {after_keyword_filter} 个商品")
        
        # 按店铺类型过滤
        if shop_type:
            filtered_products = self.filter_products_by_shop_type(
                filtered_products, shop_type
            )
        after_shop_type_filter = len(filtered_products)
        if shop_type:
            logger.info(f"📊 店铺类型过滤后: {after_shop_type_filter} 个商品")
        
        # 清洗并准备入库数据
        keywords_to_insert = []
        for product in filtered_products:
            title = product.get('title', '')
            keyword = self.clean_title_as_keyword(title)
            
            if not keyword:
                continue
            
            keyword_data = {
                'keyword': keyword,
                'project_id': project_id,
                'source': 'taobao',
                'status': 'pending',
                'taobao_sales': product.get('sales'),
                'taobao_price': product.get('price'),
                'origin_url': product.get('detail_url'),
                'taobao_shop_name': product.get('shop_name'),
                'taobao_shop_type': product.get('shop_type'),
            }
            keywords_to_insert.append(keyword_data)
        
        # 批量插入数据库
        inserted = 0
        if keywords_to_insert:
            try:
                # 分批插入（每次最多100条）
                batch_size = 100
                for i in range(0, len(keywords_to_insert), batch_size):
                    batch = keywords_to_insert[i:i + batch_size]
                    result = self.supabase.table('keywords').insert(batch).execute()
                    inserted += len(batch)
                    logger.info(f"已插入 {inserted}/{len(keywords_to_insert)} 条关键词")
                
                logger.info(f"✅ 成功插入 {inserted} 条关键词到数据库")
            except Exception as e:
                logger.error(f"❌ 插入数据库失败: {str(e)}")
                raise
        
        return {
            'total_crawled': total_crawled,
            'after_sales_filter': after_sales_filter,
            'after_price_filter': after_price_filter,
            'after_keyword_filter': after_keyword_filter,
            'after_shop_type_filter': after_shop_type_filter,
            'inserted': inserted
        }


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='淘宝关键词挖掘工具')
    parser.add_argument('--headless', action='store_true', help='无头模式运行（登录时不建议使用）')
    parser.add_argument('--auth-file', default='auth_taobao.json', help='认证文件路径 (默认: auth_taobao.json)')
    
    # 登录相关参数
    parser.add_argument('--setup-login', action='store_true', help='设置登录（扫码登录并保存Cookies）')
    parser.add_argument('--check-login', action='store_true', help='检查登录状态（验证Cookies是否有效）')
    parser.add_argument('--non-interactive', action='store_true', help='非交互模式（自动检测登录完成，用于 API 调用）')
    
    # 挖掘相关参数
    parser.add_argument('--mine', action='store_true', help='开始挖掘关键词')
    parser.add_argument('--seed-words', type=str, help='种子词列表，用逗号分隔，例如: "野生,自制"')
    parser.add_argument('--project-id', type=str, help='项目 ID（必需，用于将数据关联到项目）')
    parser.add_argument('--max-pages', type=int, default=5, help='每个种子词最多抓取页数 (默认: 5)')
    parser.add_argument('--min-sales', type=int, default=50, help='最小销量过滤 (默认: 50)')
    parser.add_argument('--max-sales', type=int, default=5000, help='最大销量过滤 (默认: 5000)')
    
    # 筛选参数
    parser.add_argument('--min-price', type=float, help='最小价格过滤（可选）')
    parser.add_argument('--max-price', type=float, help='最大价格过滤（可选）')
    parser.add_argument('--must-contain', type=str, help='必须包含的关键词列表，用逗号分隔（可选）')
    parser.add_argument('--must-not-contain', type=str, help='不能包含的关键词列表，用逗号分隔（可选）')
    parser.add_argument('--shop-type', type=str, choices=['tmall', 'c_shop', 'all'], 
                       help='店铺类型过滤: tmall(天猫), c_shop(C店), all(不限，默认)')
    
    # Supabase 配置（可选，优先使用环境变量）
    parser.add_argument('--supabase-url', type=str, help='Supabase 项目 URL')
    parser.add_argument('--supabase-key', type=str, help='Supabase API Key')
    
    args = parser.parse_args()
    
    # 创建挖掘器实例
    miner = TaobaoMiner(
        headless=args.headless,
        auth_file=args.auth_file,
        supabase_url=args.supabase_url,
        supabase_key=args.supabase_key
    )
    
    # 检查登录状态
    if args.check_login:
        logger.info("=" * 60)
        logger.info("检查登录状态...")
        logger.info("=" * 60)
        
        with sync_playwright() as p:
            browser, context, page = miner.create_browser_context(p)
            try:
                # 加载 Cookies
                if not miner.load_cookies(page):
                    logger.info("未找到认证文件或加载失败")
                    import sys
                    sys.stderr.write("LOGIN_STATUS:false\n")
                    sys.stderr.flush()
                    return
                
                # 检查登录状态
                is_logged_in = miner.is_logged_in(page)
                
                if is_logged_in:
                    logger.info("✅ 已登录，Cookies 有效")
                else:
                    logger.warning("❌ 未登录或 Cookies 已失效")
                
                # 输出状态标志（用于 API 解析）
                # 使用 sys.stderr 避免与日志混淆
                import sys
                sys.stderr.write(f"LOGIN_STATUS:{'true' if is_logged_in else 'false'}\n")
                sys.stderr.flush()
                    
            except Exception as e:
                logger.error(f"检查登录状态时出错: {str(e)}")
                import sys
                sys.stderr.write("LOGIN_STATUS:false\n")
                sys.stderr.flush()
            finally:
                browser.close()
        
        return
    
    # 执行登录设置
    if args.setup_login:
        logger.info("=" * 60)
        logger.info("淘宝关键词挖掘工具 - 登录设置")
        logger.info("=" * 60)
        
        success = miner.setup_login(interactive=not args.non_interactive)
        
        if success:
            logger.info("=" * 60)
            logger.info("✅ 登录设置完成！")
            logger.info("=" * 60)
            logger.info("接下来可以使用以下命令开始挖掘：")
            logger.info("  python scripts/taobao_miner.py --mine --seed-words '野生,自制'")
            logger.info("=" * 60)
        else:
            logger.error("=" * 60)
            logger.error("❌ 登录设置失败，请重试")
            logger.error("=" * 60)
    
    # 执行挖掘
    elif args.mine:
        if not args.seed_words:
            logger.error("❌ 请指定种子词: --seed-words '野生,自制'")
            return
        
        # 解析种子词列表
        seed_words = [w.strip() for w in args.seed_words.split(',') if w.strip()]
        if not seed_words:
            logger.error("❌ 种子词列表为空")
            return
        
        # 如果指定了项目 ID，执行完整流程（抓取+过滤+入库）
        if args.project_id:
            # 解析关键词筛选参数
            must_contain = None
            if args.must_contain:
                must_contain = [w.strip() for w in args.must_contain.split(',') if w.strip()]
            
            must_not_contain = None
            if args.must_not_contain:
                must_not_contain = [w.strip() for w in args.must_not_contain.split(',') if w.strip()]
            
            result = miner.mine_and_save(
                seed_words=seed_words,
                project_id=args.project_id,
                max_pages=args.max_pages,
                min_sales=args.min_sales,
                max_sales=args.max_sales,
                min_price=args.min_price,
                max_price=args.max_price,
                must_contain_keywords=must_contain,
                must_not_contain_keywords=must_not_contain,
                shop_type=args.shop_type if args.shop_type != 'all' else None
            )
            
            logger.info("=" * 60)
            logger.info("✅ 挖掘和入库完成！")
            logger.info(f"   抓取: {result['total_crawled']} 个商品")
            logger.info(f"   销量过滤后: {result['after_sales_filter']} 个商品")
            if args.min_price or args.max_price:
                logger.info(f"   价格过滤后: {result['after_price_filter']} 个商品")
            if must_contain or must_not_contain:
                logger.info(f"   关键词过滤后: {result['after_keyword_filter']} 个商品")
            if args.shop_type and args.shop_type != 'all':
                logger.info(f"   店铺类型过滤后: {result['after_shop_type_filter']} 个商品")
            logger.info(f"   最终入库: {result['inserted']} 条关键词")
            logger.info("=" * 60)
            logger.info("💡 提示: 可以到 Dashboard 查看新导入的数据 (source=taobao)")
        else:
            # 只抓取不入库（用于测试）
            logger.warning("⚠️ 未指定项目 ID，只抓取不入库（用于测试）")
            logger.info("💡 提示: 使用 --project-id <项目ID> 可以将数据保存到数据库")
            
            products = miner.mine_keywords(
                seed_words=seed_words,
                max_pages=args.max_pages,
                min_sales=args.min_sales,
                max_sales=args.max_sales
            )
            
            # 打印结果摘要
            logger.info("=" * 60)
            logger.info("抓取结果摘要:")
            logger.info("=" * 60)
            
            for i, product in enumerate(products[:10], 1):  # 只显示前10个
                logger.info(f"{i}. {product.get('title', 'N/A')[:50]}...")
                logger.info(f"   价格: {product.get('price', 'N/A')} | 销量: {product.get('sales', 'N/A')} | 店铺: {product.get('shop_name', 'N/A')}")
            
            if len(products) > 10:
                logger.info(f"... 还有 {len(products) - 10} 个商品")
            
            logger.info("=" * 60)
            logger.info(f"总计: {len(products)} 个商品")
            logger.info("=" * 60)
        
    else:
        # 默认显示帮助信息
        parser.print_help()
        logger.info("")
        logger.info("使用示例:")
        logger.info("  1. 首次登录: python scripts/taobao_miner.py --setup-login")
        logger.info("  2. 开始挖掘（含入库）: python scripts/taobao_miner.py --mine --seed-words '野生,自制' --project-id <项目ID>")
        logger.info("  3. 只测试抓取（不入库）: python scripts/taobao_miner.py --mine --seed-words '野生,自制'")


if __name__ == "__main__":
    main()

