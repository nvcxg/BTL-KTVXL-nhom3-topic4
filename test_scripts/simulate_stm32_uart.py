#!/usr/bin/env python3
"""
Test Script: Simulate STM32 UART packets sent to ESP32 over a Serial COM port.
Useful to test your ESP32 board before connecting actual STM32 hardware.

Requirements:
    pip install pyserial

Usage:
    python simulate_stm32_uart.py --port COM3 --baud 115200
"""

import sys
import time
import json
import argparse
import random

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("Warning: pyserial is not installed. Run 'pip install pyserial' to use serial COM simulation.")
    serial = None

def list_available_ports():
    if not serial: return
    ports = serial.tools.list_ports.comports()
    print("Available COM Ports:")
    for p in ports:
        print(f"  - {p.device}: {p.description}")

def send_uart_packets(port, baudrate, interval=2.0):
    if not serial:
        print("Please install pyserial first: pip install pyserial")
        return

    try:
        ser = serial.Serial(port, baudrate, timeout=1)
        print(f"Opened {port} at {baudrate} baud successfully!")
    except Exception as e:
        print(f"Error opening port {port}: {e}")
        list_available_ports()
        return

    print("Sending simulated STM32 UART packets to ESP32... (Press Ctrl+C to exit)")

    try:
        while True:
            # Generate random realistic test data
            ppm = random.randint(40, 175)
            
            if ppm >= 150:
                status = "IN CALL"
                buzzer = 1
                mute = 0
            elif ppm >= 136:
                status = "SMS SENT"
                buzzer = 1
                mute = 0
            else:
                status = "NOT CALL"
                buzzer = 0
                mute = 0

            # Packet format 1: JSON formatted line (Recommended for ESP32)
            packet = {
                "ppm": ppm,
                "status": status,
                "buzzer": buzzer,
                "mute": mute,
                "adc": int(ppm * 13.65)
            }
            line = json.dumps(packet) + "\n"

            ser.write(line.encode('utf-8'))
            print(f"Sent: {line.strip()}")
            time.sleep(interval)

    except KeyboardInterrupt:
        print("\nStopping UART simulation.")
    finally:
        ser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate STM32 UART to ESP32")
    parser.add_argument("--port", default="COM3", help="Serial port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--interval", type=float, default=2.0, help="Interval in seconds")
    parser.add_argument("--list", action="store_true", help="List all available COM ports")

    args = parser.parse_args()

    if args.list:
        list_available_ports()
    else:
        send_uart_packets(args.port, args.baud, args.interval)

