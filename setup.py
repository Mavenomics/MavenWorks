"""Setup file for MavenWorks python package."""

from setuptools import setup
import os

with open("README.md") as f:
    desc = f.read()

setup(
    name="mavenworks",
    version="0.0.1.dev1+build" + os.environ.get("BUILD_NUMBER", "develop"),
    description="Dashboarding for JupyterLab",
    long_description=desc,
    long_description_content_type="text/markdown",
    author="Mavenomics, Inc",
    license="GPL-3.0 (C) 2019 Mavenomics, Inc.",
    classifiers=[
        "Development Status :: 2 - Pre-Alpha",
        "Framework :: IPython",
    ],
    packages=[
        "mavenworks",
        "mavenworks.dashboard",
        "mavenworks.parts",
        "mavenworks.services",
        "mavenworks.server",
    ],
    install_requires=[
        "requests",
        "rx",
        "pandas",
        "IPython",
        "ipywidgets",
        "matplotlib",
    ],
    extra_requires={
        "pyarrow-table-interop": [
            "pyarrow"
        ]
    },
    python_requires="~=3.6",
    include_package_data=True
)
