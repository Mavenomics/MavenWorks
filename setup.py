"""Setup file for MavenWorks python package."""

from setuptools import setup
from setuptools.command.install import install
from subprocess import check_call
import os


# Many thanks to https://stackoverflow.com/a/36902139
class PostInstallCommand(install):
    """Post-installation for installation mode."""
    def run(self):
        install.run(self)
        check_call("jupyter serverextension enable --py mavenworks.server".split())

with open("README.md") as f:
    desc = f.read()

setup(
    name="mavenworks",
    version="0.0.3.dev1+build" + os.environ.get("BUILD_NUMBER", "develop"),
    description="Dashboarding for JupyterLab",
    long_description=desc,
    long_description_content_type="text/markdown",
    author="Mavenomics, Inc",
    license="GPL-3.0 (C) 2019 Mavenomics, Inc.",
    classifiers=[
        "Development Status :: 2 - Pre-Alpha",
        "Framework :: IPython",
    ],
    cmdclass={
        'install': PostInstallCommand,
    },
    packages=[
        "mavenworks",
        "mavenworks.dashboard",
        "mavenworks.parts",
        "mavenworks.services",
        "mavenworks.server",
    ],
    install_requires=[
        "requests",
        "rx>=1.0,<3",
        "jupyterlab>1.0"
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
