#include<iostream>
using namespace std;
int main()
{
int n,t;
cin>>t;
while(t--)
{
    cin>>n;
    int arr[n],i,j,flag=0;
        for(i=0;i<n;i++)
        cin>>arr[i];
    if(n%2==0)
    {
        flag=1;
        cout<<"no"<<endl;
    }
    else
    {

        if(arr[0]!=1)
        {
           flag=1;
           cout<<"no"<<endl;
        }
        else
        {
            for(i=0;i<=(n/2);i++)
            {
                if(arr[i]!=i+1)
                {
                    flag=1;
                    cout<<"no"<<endl;
                    break;
                }
            }
            if(flag!=1)
            {
            j=n/2+1;
                for(i=n/2;i>=1;i--,j++)
                {
                    if(arr[j]!=i)
                    {
                        flag=1;
                        cout<<"no"<<endl;
                        break;
                    }
                }
            }
        }

    }
    if(flag==0)
    cout<<"yes"<<endl;
    flag=0;
}
return 0;
}
