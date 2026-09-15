#!/usr/bin/env python3
"""
Test Script: Simulate sensor & STM32 data pushing directly to Firebase Realtime Database.
Allows verifying the Web Dashboard in real time without needing ESP32/STM32 hardware connected.

Usage:
    python simulate_firebase.py --url https://<YOUR-PROJECT>-default-rtdb.firebaseio.com [--secret <DB_SECRET>]
"""

import sys
import time
import json
import argparse
import random
try:
    import urllib.request
except ImportError:
    pass

def push_data(db_url, data_path, payload, secret=None):
    clean_url = db_url.rstrip('/')
    clean_path = data_path.strip('/')
    endpoint = f"{clean_url}/{clean_path}.json"
    if secret:
        endpoint += f"?auth={secret}"
    
    json_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(endpoint, data=json_bytes, method='PUT')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, response.read().decode('utf-8')
    except Exception as e:
        return None, str(e)

def run_simulation(db_url, data_path, secret, interval=2.0):
    print("=" * 65)
    print(" 🔥 GAS & FIRE WARNING SYSTEM - FIREBASE SIMULATOR 🔥")
    print(f" Target Endpoint: {db_url}/{data_path}.json")
    print(" Press Ctrl+C to stop.")
    print("=" * 65)

    scenarios = [
        # (duration_steps, min_ppm, max_ppm, status, buzzer, mute, description)
        (5, 40, 85, "NOT CALL", False, False, "1. Giai đoạn Bình thường (PPM < 136)"),
        (4, 136, 148, "SMS SENT", True, False, "2. Giai đoạn Cảnh báo Cấp 1 (136 <= PPM < 150: SMS + Còi)"),
        (4, 150, 185, "IN CALL", True, False, "3. Giai đoạn Nguy hiểm Cấp 2 (PPM >= 150: Gọi điện + Còi)"),
        (3, 142, 160, "IN CALL", False, True, "4. Giai đoạn Nhấn nút MUTE tắt cảnh báo giả (False Alarm)"),
        (4, 50, 95, "NOT CALL", False, False, "5. Trở lại trạng thái An toàn"),
    ]

    step_counter = 0

    while True:
        for steps, min_p, max_p, status, buzzer, mute, desc in scenarios:
            print(f"\n---> [BẮT ĐẦU KỊCH BẢN]: {desc}")
            for s in range(steps):
                step_counter += 1
                ppm = random.randint(min_p, max_p)
                adc_raw = int(ppm * 13.65) + random.randint(-10, 10)
                
                payload = {
                    "ppm": ppm,
                    "status": status,
                    "buzzer": 1 if buzzer else 0,
                    "mute": 1 if mute else 0,
                    "phone": "+84987654321",
                    "adc": adc_raw,
                    "timestamp": int(time.time()),
                    "packet_id": step_counter,
                    "msg": desc
                }

                status_code, resp = push_data(db_url, data_path, payload, secret)
                
                if status_code in (200, 204):
                    print(f"[{time.strftime('%H:%M:%S')}] Pushed OK -> PPM: {ppm:3d} | SIM: {status:10s} | Buzzer: {'ON ' if buzzer else 'OFF'} | Mute: {'YES' if mute else 'NO '}")
                else:
                    print(f"[{time.strftime('%H:%M:%S')}] Push FAILED ({status_code}): {resp}")
                
                time.sleep(interval)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Gas Alert IoT data to Firebase Realtime Database")
    parser.add_argument("--url", default="https://btl-nhom3-gas-alert-default-rtdb.firebaseio.com", help="Firebase Database URL")
    parser.add_argument("--path", default="device_data", help="Database child path (default: device_data)")
    parser.add_argument("--secret", default=None, help="Database Secret (if write rules require auth)")
    parser.add_argument("--interval", type=float, default=2.0, help="Interval in seconds between updates")

    args = parser.parse_args()
    
    try:
        run_simulation(args.url, args.path, args.secret, args.interval)
    except KeyboardInterrupt:
        print("\n\nĐã dừng mô phỏng.")

