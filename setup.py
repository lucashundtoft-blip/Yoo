"""Setup configuration for Finnhub API skill."""

from setuptools import setup, find_packages

with open("finnhub_api/README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="finnhub-api-skill",
    version="0.1.0",
    author="Lucas Hundtoft",
    author_email="lucashundtoft@gmail.com",
    description="Finnhub API skill for fetching financial market data",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/lucashundtoft-blip/yoo",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Office/Business :: Financial",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
    ],
    entry_points={
        "console_scripts": [
            "finnhub=finnhub_api.cli:main",
        ],
    },
)
