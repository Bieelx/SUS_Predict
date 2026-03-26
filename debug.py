# debug.py
from pysus.online_data.SIH import download as sih
from pysus.online_data.SIM import download as sim
from pysus.online_data.SINASC import download as sinasc
import inspect

print("SIH:   ", inspect.signature(sih))
print("SIM:   ", inspect.signature(sim))
print("SINASC:", inspect.signature(sinasc))
