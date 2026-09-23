from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler
import socketserver
import os
import mimetypes

mimetypes.add_type('application/javascript', '.js')

class CORSRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Service-Worker-Allowed', '/')
        return super(CORSRequestHandler, self).end_headers()
        
    def do_GET(self):
        self.directory = os.getcwd()
        return SimpleHTTPRequestHandler.do_GET(self)
        
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except ConnectionAbortedError:
            pass

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 500
    timeout = 60

if __name__ == '__main__':
    PORT = 8000
    ADDRESS = ""
    socketserver.TCPServer.allow_reuse_address = False
    
    try:
        with ThreadedTCPServer((ADDRESS, PORT), CORSRequestHandler) as httpd:
            with ThreadPoolExecutor(max_workers=500) as executor:
                print(f"Server running at http://localhost:{PORT}")
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    print("\nShutting down server...")
                    httpd.shutdown()
    except OSError as e:
        if "10048" in str(e) or getattr(e, 'winerror', None) == 10048:
            print(f"\n[提示] 端口 {PORT} 已有服务正在运行中，无需重复启动。")
            print(f"请直接在浏览器中打开: http://localhost:{PORT}\n")
        else:
            raise e